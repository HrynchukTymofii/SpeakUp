import type { DbClient, Subscription } from "@speakup/db";
import type { Plan } from "@speakup/shared";

export interface Entitlements {
  plan: Plan;
  dailyAnalysesLimit: number;
}

/**
 * SPEC §5 entitlements rule: a subscription grants Pro if its status is active/trialing and
 * its period hasn't ended (null end = no known end, e.g. not yet reported by the provider).
 * Pure function → unit-tested without a DB.
 */
export function grantsPro(
  sub: Pick<Subscription, "plan" | "status" | "currentPeriodEnd">,
  now: Date,
): boolean {
  const activeStatus = sub.status === "active" || sub.status === "trialing";
  const inPeriod = sub.currentPeriodEnd === null || sub.currentPeriodEnd > now;
  return sub.plan === "pro" && activeStatus && inPeriod;
}

/**
 * The ONE place that decides what a user may do. Routes never check subscriptions directly,
 * so when billing rules change (trials, grace periods, App Store) only this function changes.
 */
export async function getEntitlements(
  db: DbClient,
  userId: string,
  limits: { free: number; pro: number },
  now: Date = new Date(),
): Promise<Entitlements> {
  const subscriptions = await db.subscription.findMany({
    where: { userId },
    select: { plan: true, status: true, currentPeriodEnd: true },
  });
  const isPro = subscriptions.some((sub) => grantsPro(sub, now));
  return isPro
    ? { plan: "pro", dailyAnalysesLimit: limits.pro }
    : { plan: "free", dailyAnalysesLimit: limits.free };
}

/**
 * The user's most recently updated subscription (any status) — for the billing page and the
 * customer portal. Entitlements still come only from `getEntitlements`.
 */
export function latestSubscription(
  db: DbClient,
  userId: string,
): Promise<Pick<
  Subscription,
  "status" | "currentPeriodEnd" | "providerCustomerId" | "providerSubscriptionId" | "source"
> | null> {
  return db.subscription.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      status: true,
      currentPeriodEnd: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      source: true,
    },
  });
}
