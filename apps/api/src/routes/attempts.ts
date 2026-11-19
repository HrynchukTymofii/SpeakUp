import type { DbClient } from "@speakup/db";
import {
  AttemptDetailResponseSchema,
  AttemptResponseSchema,
  CreateAttemptBodySchema,
  CreateAttemptResponseSchema,
  AttemptsListResponseSchema,
  detectProblems,
  ErrorCode,
  FeedbackSchema,
  ListAttemptsQuerySchema,
  MetricsSchema,
  SubmitAttemptBodySchema,
  TranscriptSchema,
  type AttemptResult,
} from "@speakup/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { currentUser } from "../plugins/auth.js";
import { AppError } from "../plugins/error-handler.js";
import { canAccessLesson } from "../services/access.js";
import type { AnalysisQueue } from "../services/analysis-queue.js";
import {
  attemptSelect,
  createAttemptWithUpload,
  stageOf,
  submitAttempt,
  toApiAttempt,
} from "../services/attempt-lifecycle.js";
import { getEntitlements } from "../services/entitlements.js";
import type { RateLimiter } from "../services/rate-limiter.js";
import type { Storage } from "../services/storage.js";
import { countAnalysesToday } from "../services/usage.js";
import { exerciseSelect } from "./courses.js";

interface AttemptRoutesOptions {
  db: DbClient;
  storage: Storage;
  queue: AnalysisQueue;
  limits: { free: number; pro: number };
  rateLimiter: RateLimiter;
  attemptsPerMinute: number;
}

export const AttemptParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Json columns come back as `unknown`-ish values. Parse them with the same schemas the worker
 * wrote them with, so a bad row fails here (500, logged) instead of breaking the page.
 */
function toApiResult(
  transcript: { text: string; words: unknown },
  analysis: { overallScore: number; metrics: unknown; feedback: unknown },
): AttemptResult {
  return {
    overallScore: analysis.overallScore,
    transcript: TranscriptSchema.parse(transcript),
    metrics: MetricsSchema.parse(analysis.metrics),
    feedback: FeedbackSchema.parse(analysis.feedback),
  };
}

/**
 * Score, subscores and problems for the history list. A row whose stored metrics/feedback don't
 * parse keeps its score but gets no details: one bad row must not break the whole list.
 */
function summarizeAnalysis(analysis: {
  overallScore: number;
  metrics: unknown;
  feedback: unknown;
}) {
  const metrics = MetricsSchema.safeParse(analysis.metrics);
  const feedback = FeedbackSchema.safeParse(analysis.feedback);
  const valid = metrics.success && feedback.success;
  return {
    overallScore: analysis.overallScore,
    subscores: feedback.success ? (feedback.data.subscores ?? null) : null,
    problems: valid ? detectProblems(metrics.data, feedback.data) : [],
  };
}

const notFound = () => new AppError(404, ErrorCode.NOT_FOUND, "Attempt not found");

/**
 * Attempt lifecycle (SPEC §6.2): create → browser uploads straight to S3 → submit → worker.
 * Must be registered inside a `requireAuth` scope.
 */
export const attemptRoutes: FastifyPluginAsyncZod<AttemptRoutesOptions> = async (
  app,
  { db, storage, queue, limits, rateLimiter, attemptsPerMinute },
) => {
  /**
   * Loads an attempt only if it belongs to the current user. Someone else's attempt gets the
   * same 404 as a missing one, so attempt ids can't be probed for existence (SPEC §9).
   */
  async function findOwnedAttempt(id: string, userId: string) {
    const attempt = await db.attempt.findUnique({
      where: { id },
      select: {
        ...attemptSelect,
        userId: true,
        audioKey: true,
        exercise: { select: { maxDurationSec: true } },
      },
    });
    if (!attempt || attempt.userId !== userId) throw notFound();
    return attempt;
  }

  /** Step 1: check access + quota, create the attempt, return a pre-signed S3 upload. */
  app.post(
    "/attempts",
    {
      schema: {
        body: CreateAttemptBodySchema,
        response: { 201: CreateAttemptResponseSchema },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const { exerciseId, mimeType } = request.body;

      // Per-user burst limit (SPEC §9: ~10/min on this route), keyed by the VERIFIED user id —
      // stricter than the global per-IP limit, and not bypassable by switching networks.
      if (!(await rateLimiter.hit(`attempts:${user.id}`, attemptsPerMinute, 60))) {
        throw new AppError(
          429,
          ErrorCode.RATE_LIMITED,
          "You're recording very fast. Please wait a minute and try again.",
          { "retry-after": "60" },
        );
      }

      const [entitlements, exercise, usedToday] = await Promise.all([
        getEntitlements(db, user.id, limits),
        db.exercise.findUnique({
          where: { id: exerciseId },
          select: { id: true, lesson: { select: { isFree: true } } },
        }),
        countAnalysesToday(db, user.id),
      ]);

      if (!exercise) throw new AppError(404, ErrorCode.NOT_FOUND, "Exercise not found");
      // Same rule as lesson locking. The baseline exercise has no lesson → open to everyone.
      if (exercise.lesson && !canAccessLesson(exercise.lesson, entitlements.plan)) {
        throw new AppError(402, ErrorCode.PAYWALL, "This exercise is part of SpeakUp Pro");
      }
      if (usedToday >= entitlements.dailyAnalysesLimit) {
        throw new AppError(
          429,
          ErrorCode.QUOTA_EXCEEDED,
          `You've used all ${entitlements.dailyAnalysesLimit} analyses for today. They reset at 00:00 UTC.`,
        );
      }

      const created = await createAttemptWithUpload(
        { db, storage },
        { owner: { userId: user.id }, exerciseId, mimeType, keyPrefix: `recordings/${user.id}` },
      );
      request.log.info({ attemptId: created.attempt.id, exerciseId }, "attempt created");
      return reply.code(201).send(created);
    },
  );

  /** Step 3 (after the browser's upload): verify the file, mark queued, enqueue the job. */
  app.post(
    "/attempts/:id/submit",
    {
      schema: {
        params: AttemptParamsSchema,
        body: SubmitAttemptBodySchema,
        response: { 202: AttemptResponseSchema },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const attempt = await findOwnedAttempt(request.params.id, user.id);
      const fresh = await submitAttempt(
        { db, storage, queue, log: request.log, requestId: request.id },
        attempt,
        {
          durationMs: request.body.durationMs,
          maxDurationSec: attempt.exercise.maxDurationSec,
        },
      );
      return reply.code(202).send({ attempt: fresh });
    },
  );

  /**
   * The caller's practice history, newest first: progress, streaks, the profile and lesson
   * suggestions are all computed from it in the app.
   */
  app.get(
    "/attempts",
    {
      schema: {
        querystring: ListAttemptsQuerySchema,
        response: { 200: AttemptsListResponseSchema },
      },
    },
    async (request) => {
      const rows = await db.attempt.findMany({
        where: { userId: currentUser(request).id },
        orderBy: { createdAt: "desc" },
        take: request.query.limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          exercise: { select: { slug: true } },
          analysis: { select: { overallScore: true, metrics: true, feedback: true } },
        },
      });
      return {
        attempts: rows.map((row) => ({
          id: row.id,
          exerciseSlug: row.exercise.slug,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          ...(row.status === "completed" && row.analysis
            ? summarizeAnalysis(row.analysis)
            : { overallScore: null, subscores: null, problems: [] }),
        })),
      };
    },
  );

  /**
   * One attempt for the results page: status (polled while the worker runs), the exercise,
   * and — once completed — transcript, metrics and feedback.
   */
  app.get(
    "/attempts/:id",
    { schema: { params: AttemptParamsSchema, response: { 200: AttemptDetailResponseSchema } } },
    async (request) => {
      const row = await db.attempt.findUnique({
        where: { id: request.params.id },
        select: {
          ...attemptSelect,
          userId: true,
          exercise: { select: exerciseSelect },
          transcript: { select: { text: true, words: true } },
          analysis: { select: { overallScore: true, metrics: true, feedback: true } },
        },
      });
      if (!row || row.userId !== currentUser(request).id) throw notFound();

      return {
        attempt: toApiAttempt(row),
        stage: stageOf(row.status, row.transcript !== null),
        exercise: row.exercise,
        result:
          row.status === "completed" && row.analysis && row.transcript
            ? toApiResult(row.transcript, row.analysis)
            : null,
      };
    },
  );
};
