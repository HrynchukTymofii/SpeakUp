import type { DbClient, User } from "@speakup/db";
import {
  MeResponseSchema,
  OnboardingAnswersSchema,
  UpdateOnboardingBodySchema,
  type MeResponse,
} from "@speakup/shared";
import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Env } from "../env.js";
import { currentUser } from "../plugins/auth.js";
import { getEntitlements, latestSubscription } from "../services/entitlements.js";
import { countAnalysesToday } from "../services/usage.js";

interface MeRoutesOptions {
  db: DbClient;
  env: Pick<Env, "FREE_DAILY_ANALYSES" | "PRO_DAILY_ANALYSES">;
}

/** Stored onboarding is JSON from the DB: re-validate on the way out instead of trusting it. */
function readOnboarding(user: User, log: FastifyBaseLogger) {
  if (user.onboarding === null) return null;
  const parsed = OnboardingAnswersSchema.safeParse(user.onboarding);
  if (!parsed.success) {
    log.warn({ userId: user.id }, "stored onboarding does not match schema");
    return null;
  }
  return parsed.data;
}

/** Routes under /v1/me. Must be registered inside a `requireAuth` scope. */
export const meRoutes: FastifyPluginAsyncZod<MeRoutesOptions> = async (app, { db, env }) => {
  const limits = { free: env.FREE_DAILY_ANALYSES, pro: env.PRO_DAILY_ANALYSES };

  async function buildMe(user: User, log: FastifyBaseLogger): Promise<MeResponse> {
    const [entitlements, analysesToday, subscription] = await Promise.all([
      getEntitlements(db, user.id, limits),
      countAnalysesToday(db, user.id),
      latestSubscription(db, user.id),
    ]);
    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        onboarding: readOnboarding(user, log),
      },
      entitlements,
      usage: { analysesToday },
      subscription: subscription && {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        manageable: subscription.providerCustomerId !== null,
      },
    };
  }

  // The auth hook's user may come from a per-process cache (plugins/auth.ts); the profile
  // shows onboarding answers another API task may have just saved, so read the row fresh.
  app.get("/me", { schema: { response: { 200: MeResponseSchema } } }, async (request) => {
    const cached = currentUser(request);
    const user = (await db.user.findUnique({ where: { id: cached.id } })) ?? cached;
    return buildMe(user, request.log);
  });

  /** Replaces the stored quiz answers (PUT = full replacement, so it's safe to retry). */
  app.put(
    "/me/onboarding",
    { schema: { body: UpdateOnboardingBodySchema, response: { 200: MeResponseSchema } } },
    async (request) => {
      const user = await db.user.update({
        where: { id: currentUser(request).id },
        data: { onboarding: request.body.answers },
      });
      return buildMe(user, request.log);
    },
  );
};
