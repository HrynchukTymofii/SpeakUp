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
import type { AttemptEvents } from "../services/attempt-events.js";
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
import { LockTimeoutError, type KeyedLock } from "../services/user-lock.js";
import { exerciseSelect } from "./courses.js";

interface AttemptRoutesOptions {
  db: DbClient;
  storage: Storage;
  queue: AnalysisQueue;
  limits: { free: number; pro: number };
  rateLimiter: RateLimiter;
  attemptsPerMinute: number;
  /** Serializes quota check + insert per user (see services/user-lock.ts). */
  locks: KeyedLock;
  /** Worker announcements that wake long-polling results requests. */
  events: AttemptEvents;
}

export const AttemptParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Longest a results request may be held. The ALB drops connections idle for 60 s, and a short
 * hold keeps a lost announcement from costing the user more than a few seconds.
 */
export const MAX_RESULT_WAIT_S = 25;
export const AttemptWaitQuerySchema = z.object({
  wait: z.coerce.number().int().min(0).max(MAX_RESULT_WAIT_S).optional(),
});

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
  { db, storage, queue, limits, rateLimiter, attemptsPerMinute, locks, events },
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
      const { exerciseId, mimeType, topic } = request.body;

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

      // Count-then-insert must not interleave for one user: without the lock, parallel
      // requests all see "under the limit" and each gets a paid analysis (load test run 4).
      const created = await locks
        .run(`quota:${user.id}`, async () => {
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

          return createAttemptWithUpload(
            { db, storage },
            {
              owner: { userId: user.id },
              exerciseId,
              mimeType,
              keyPrefix: `recordings/${user.id}`,
              topic,
            },
          );
        })
        .catch((err: unknown) => {
          if (!(err instanceof LockTimeoutError)) throw err;
          throw new AppError(
            429,
            ErrorCode.RATE_LIMITED,
            "You're recording very fast. Please wait a moment and try again.",
            { "retry-after": "5" },
          );
        });
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

  // Status + stage only: the results page asks for this repeatedly while the worker runs (83% of
  // all API requests in the load test), so the transcript words and the feedback JSON are
  // loaded once, when the attempt has completed.
  const loadSummary = (id: string) =>
    db.attempt.findUnique({
      where: { id },
      select: {
        ...attemptSelect,
        userId: true,
        exercise: { select: exerciseSelect },
        transcript: { select: { attemptId: true } }, // exists? → "analyzing" stage
      },
    });

  /**
   * One attempt for the results page: status, the exercise, and — once completed — transcript,
   * metrics and feedback.
   *
   * `?wait=N` (long-polling): while the worker is still on it, hold the request up to N seconds
   * and answer as soon as the worker announces a change, so the result reaches the page the
   * moment it's ready instead of on the next poll (docs/scaling.md §2.2).
   */
  app.get(
    "/attempts/:id",
    {
      schema: {
        params: AttemptParamsSchema,
        querystring: AttemptWaitQuerySchema,
        response: { 200: AttemptDetailResponseSchema },
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      const waitMs = (request.query.wait ?? 0) * 1000;
      // Listen BEFORE the first read: a change landing between the read and the wait would
      // otherwise be missed, and the request would sit out the full wait for nothing.
      const stop = new AbortController();
      reply.raw.once("close", () => stop.abort()); // the browser left: stop waiting
      const changed = waitMs > 0 ? events.waitForChange(id, waitMs, stop.signal) : null;

      let row;
      try {
        row = await loadSummary(id);
        if (!row || row.userId !== currentUser(request).id) throw notFound();
        if (changed && (row.status === "queued" || row.status === "processing")) {
          await changed;
          // Re-read even after a timeout: if an announcement got lost, this still catches up.
          row = (await loadSummary(id)) ?? row;
        }
      } finally {
        stop.abort();
      }

      let result = null;
      if (row.status === "completed") {
        const full = await db.attempt.findUnique({
          where: { id },
          select: {
            transcript: { select: { text: true, words: true } },
            analysis: { select: { overallScore: true, metrics: true, feedback: true } },
          },
        });
        if (full?.transcript && full.analysis) result = toApiResult(full.transcript, full.analysis);
      }

      return {
        attempt: toApiAttempt(row),
        stage: stageOf(row.status, row.transcript !== null),
        exercise: row.exercise,
        result,
      };
    },
  );
};
