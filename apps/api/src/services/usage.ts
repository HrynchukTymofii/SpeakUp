import type { DbClient } from "@speakup/db";

/** Start of the current day in UTC. Quotas reset at 00:00 UTC for everyone (simple + predictable). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Analyses used today = attempts created today, EXCEPT ones that failed on our side
 * (STT/LLM/internal errors): users shouldn't pay quota for our outages. A NO_SPEECH failure
 * still counts — otherwise silent recordings would be a free way to burn our STT budget.
 * Unsubmitted attempts count too, so creating attempts in a loop can't bypass the limit.
 * Served by the `Attempt(userId, createdAt)` index: a cheap range count even with long history.
 */
export function countAnalysesToday(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  return db.attempt.count({
    where: {
      userId,
      createdAt: { gte: startOfUtcDay(now) },
      NOT: { status: "failed", errorCode: { not: "NO_SPEECH" } },
    },
  });
}
