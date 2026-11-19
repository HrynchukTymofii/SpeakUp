import type { DbClient } from "@speakup/db";
import {
  ClaimFunnelBodySchema,
  ClaimFunnelResponseSchema,
  CreateAttemptResponseSchema,
  CreateFunnelAttemptBodySchema,
  CreateFunnelSessionResponseSchema,
  ErrorCode,
  ExerciseResponseSchema,
  FUNNEL_MAX_RECORDING_SEC,
  FunnelAnswersSchema,
  FunnelAttemptStatusResponseSchema,
  GENERAL_SPEAKING_CHECK,
  speakingCheckSlug,
  OnboardingAnswersSchema,
  SubmitAttemptBodySchema,
  UpdateFunnelSessionBodySchema,
} from "@speakup/shared";
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { currentUser } from "../plugins/auth.js";
import { AppError } from "../plugins/error-handler.js";
import { currentGuest, requireGuest } from "../plugins/guest-auth.js";
import type { AnalysisQueue } from "../services/analysis-queue.js";
import {
  attemptSelect,
  createAttemptWithUpload,
  stageOf,
  submitAttempt,
  toApiAttempt,
} from "../services/attempt-lifecycle.js";
import type { BotCheck } from "../services/bot-check.js";
import { createGuestToken, hashGuestToken, hashIp } from "../services/guest-token.js";
import type { RateLimiter } from "../services/rate-limiter.js";
import type { Storage } from "../services/storage.js";
import { startOfUtcDay } from "../services/usage.js";
import { AttemptParamsSchema } from "./attempts.js";
import { exerciseSelect } from "./courses.js";

interface FunnelRoutesOptions {
  db: DbClient;
  storage: Storage;
  queue: AnalysisQueue;
  botCheck: BotCheck;
  rateLimiter: RateLimiter;
  ipDailyLimit: number;
  ipHashSecret: string;
}

/** Stored answers are JSON; anything that no longer validates is dropped instead of failing. */
function storedAnswers(raw: unknown) {
  const parsed = FunnelAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * The funnel's speaking check for this visitor's goal (`check-<goal>`), falling back to the
 * general one. Both the exercise screen and the attempt use this, so they always agree.
 */
async function findSpeakingCheck(db: DbClient, answers: unknown) {
  const slug = speakingCheckSlug(storedAnswers(answers).goal);
  const exercise =
    (await db.exercise.findUnique({ where: { slug }, select: exerciseSelect })) ??
    (await db.exercise.findUnique({
      where: { slug: GENERAL_SPEAKING_CHECK },
      select: exerciseSelect,
    }));
  if (!exercise) throw new Error("Speaking check exercises missing — run `pnpm db:seed`");
  return exercise;
}

const notFound = () => new AppError(404, ErrorCode.NOT_FOUND, "Attempt not found");

/**
 * Anonymous funnel routes (SPEC §7, §15): no Clerk account yet. The visitor proves who they are
 * with the guest token from `POST /funnel/sessions`. Results are never returned here — only
 * after sign-up and the claim, to the account owner.
 */
export const funnelGuestRoutes: FastifyPluginAsyncZod<FunnelRoutesOptions> = async (app, opts) => {
  const { db, storage, queue } = opts;

  /** Step 1 of the funnel: create a session. The token is returned once and never stored. */
  app.post(
    "/funnel/sessions",
    { schema: { response: { 201: CreateFunnelSessionResponseSchema } } },
    async (request, reply) => {
      const { token, tokenHash } = createGuestToken();
      const session = await db.funnelSession.create({
        data: { tokenHash, ipHash: hashIp(request.ip, opts.ipHashSecret) },
        select: { id: true },
      });
      request.log.info({ funnelSessionId: session.id }, "funnel session created");
      return reply.code(201).send({ token });
    },
  );

  // Everything below needs the guest token.
  await app.register(async (scope) => {
    // A child scope, so the guest hook applies only to the routes below (not to /sessions).
    // withTypeProvider: nested plugins don't inherit the Zod typing automatically.
    const guest = scope.withTypeProvider<ZodTypeProvider>();
    requireGuest(guest, { db });

    /** Save answers as the visitor moves through the steps (merged, so order doesn't matter). */
    guest.patch(
      "/funnel/sessions/current",
      { schema: { body: UpdateFunnelSessionBodySchema } },
      async (request, reply) => {
        const session = currentGuest(request);
        const { answers, currentStep } = request.body;
        await db.funnelSession.update({
          where: { id: session.id },
          data: {
            answers: { ...storedAnswers(session.answers), ...answers },
            ...(currentStep && { currentStep }),
          },
        });
        return reply.code(204).send();
      },
    );

    /** The speaking check for the visitor's goal (an impromptu answer, no script). */
    guest.get(
      "/funnel/exercise",
      { schema: { response: { 200: ExerciseResponseSchema } } },
      async (request) => {
        const exercise = await findSpeakingCheck(db, currentGuest(request).answers);
        // The funnel caps recordings at 45 s even if the exercise allows longer.
        return {
          exercise: {
            ...exercise,
            maxDurationSec: Math.min(exercise.maxDurationSec, FUNNEL_MAX_RECORDING_SEC),
          },
        };
      },
    );

    /**
     * The anonymous baseline recording. The expensive part (STT + LLM) happens later, so this is
     * where abuse is stopped: bot check → one baseline per session → per-IP daily limit.
     */
    guest.post(
      "/funnel/attempts",
      {
        schema: {
          body: CreateFunnelAttemptBodySchema,
          response: { 201: CreateAttemptResponseSchema },
        },
      },
      async (request, reply) => {
        const session = currentGuest(request);
        const { mimeType, turnstileToken } = request.body;

        if (session.userId) {
          throw new AppError(
            409,
            ErrorCode.WRONG_STATE,
            "This session already belongs to an account",
          );
        }
        if (!(await opts.botCheck.verify(turnstileToken, request.ip))) {
          throw new AppError(
            403,
            ErrorCode.BOT_CHECK_FAILED,
            "Bot check failed. Please try again.",
          );
        }

        const existing = await db.attempt.findFirst({
          where: { funnelSessionId: session.id },
          select: { id: true, status: true },
        });
        if (existing && existing.status !== "awaiting_upload") {
          throw new AppError(409, ErrorCode.WRONG_STATE, "The baseline was already recorded");
        }

        // Count only NEW analyses against the IP (a re-take before submitting isn't a new one).
        if (!existing) {
          const day = startOfUtcDay(new Date()).toISOString().slice(0, 10);
          const ipHash = hashIp(request.ip, opts.ipHashSecret);
          const allowed = await opts.rateLimiter.hit(
            `funnel-analyses:${ipHash}:${day}`,
            opts.ipDailyLimit,
            24 * 60 * 60,
          );
          if (!allowed) {
            throw new AppError(
              429,
              ErrorCode.RATE_LIMITED,
              "Too many speaking checks from this network today. Please try again tomorrow.",
            );
          }
        }

        const check = await findSpeakingCheck(db, session.answers);

        // Re-take before submit: drop the unsubmitted attempt and start a fresh one (new key,
        // possibly new format). Its S3 object, if any, still has the "pending" tag → auto-deleted.
        if (existing) await db.attempt.delete({ where: { id: existing.id } });

        const created = await createAttemptWithUpload(
          { db, storage },
          {
            owner: { funnelSessionId: session.id },
            exerciseId: check.id,
            mimeType,
            keyPrefix: `recordings/funnel/${session.id}`,
          },
        );
        request.log.info(
          { attemptId: created.attempt.id, funnelSessionId: session.id },
          "funnel attempt created",
        );
        return reply.code(201).send(created);
      },
    );

    /** Loads an attempt only if it belongs to this guest session (else 404, no existence leak). */
    async function findSessionAttempt(id: string, sessionId: string) {
      const attempt = await db.attempt.findUnique({
        where: { id },
        select: {
          ...attemptSelect,
          funnelSessionId: true,
          audioKey: true,
          exercise: { select: { maxDurationSec: true } },
          transcript: { select: { id: true } },
        },
      });
      if (!attempt || attempt.funnelSessionId !== sessionId) throw notFound();
      return attempt;
    }

    guest.post(
      "/funnel/attempts/:id/submit",
      {
        schema: {
          params: AttemptParamsSchema,
          body: SubmitAttemptBodySchema,
          response: { 202: FunnelAttemptStatusResponseSchema },
        },
      },
      async (request, reply) => {
        const session = currentGuest(request);
        const attempt = await findSessionAttempt(request.params.id, session.id);
        const fresh = await submitAttempt(
          { db, storage, queue, log: request.log, requestId: request.id },
          attempt,
          {
            durationMs: request.body.durationMs,
            maxDurationSec: Math.min(attempt.exercise.maxDurationSec, FUNNEL_MAX_RECORDING_SEC),
          },
        );
        return reply.code(202).send({
          attempt: { id: fresh.id, status: fresh.status, stage: stageOf(fresh.status, false) },
        });
      },
    );

    /** Progress for the "your analysis is being prepared" line. Never the result itself. */
    guest.get(
      "/funnel/attempts/:id",
      {
        schema: {
          params: AttemptParamsSchema,
          response: { 200: FunnelAttemptStatusResponseSchema },
        },
      },
      async (request) => {
        const attempt = await findSessionAttempt(request.params.id, currentGuest(request).id);
        const { id, status } = toApiAttempt(attempt);
        return { attempt: { id, status, stage: stageOf(status, attempt.transcript !== null) } };
      },
    );
  });
};

/**
 * `POST /funnel/claim` — signed-in user + guest token (in the body). Attaches the session and its
 * baseline attempt to the account and copies the answers into `User.onboarding`.
 * Idempotent: claiming twice (double click, page reload) is fine; claiming someone else's
 * session is not. Must be registered inside a `requireAuth` scope.
 */
export const funnelClaimRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = async (app, { db }) => {
  app.post(
    "/funnel/claim",
    { schema: { body: ClaimFunnelBodySchema, response: { 200: ClaimFunnelResponseSchema } } },
    async (request) => {
      const user = currentUser(request);
      const session = await db.funnelSession.findUnique({
        where: { tokenHash: hashGuestToken(request.body.guestToken) },
        select: { id: true, userId: true, answers: true, claimedAt: true },
      });
      if (!session) throw new AppError(404, ErrorCode.NOT_FOUND, "Funnel session not found");
      if (session.userId && session.userId !== user.id) {
        throw new AppError(409, ErrorCode.WRONG_STATE, "This session belongs to another account");
      }

      // Funnel answers fill in / refresh the onboarding answers; anything else already there stays.
      const existing = OnboardingAnswersSchema.safeParse(user.onboarding);
      const onboarding = {
        ...(existing.success ? existing.data : {}),
        ...storedAnswers(session.answers),
      };

      // One transaction: either the session, its attempts and the profile all move, or nothing.
      await db.$transaction([
        db.funnelSession.update({
          where: { id: session.id },
          data: { userId: user.id, claimedAt: session.claimedAt ?? new Date() },
        }),
        db.attempt.updateMany({
          where: { funnelSessionId: session.id, userId: null },
          data: { userId: user.id },
        }),
        db.user.update({ where: { id: user.id }, data: { onboarding } }),
      ]);

      const attempt = await db.attempt.findFirst({
        where: { funnelSessionId: session.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      request.log.info({ funnelSessionId: session.id, attemptId: attempt?.id }, "funnel claimed");
      return { attemptId: attempt?.id ?? null };
    },
  );
};
