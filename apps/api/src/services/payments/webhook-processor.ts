import type { DbClient } from "@speakup/db";
import type { FastifyBaseLogger } from "fastify";
import type { NormalizedEvent, PaymentSource } from "./types.js";

export type WebhookOutcome = "processed" | "duplicate" | "stale" | "unlinked" | "ignored";

/** Prisma's "unique constraint failed" error code. */
const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

/**
 * Applies one verified webhook (SPEC §8):
 * 1. **Idempotency:** insert `WebhookEvent(source, eventId)`. The unique index makes a second
 *    delivery of the same event fail → we answer 200 and do nothing ("duplicate").
 * 2. In the **same transaction**, upsert the `Subscription`. If anything fails, the event row is
 *    rolled back too, so the provider's retry will process it again.
 * 3. **Ordering:** providers don't guarantee delivery order. An event older than the newest one
 *    already applied (`lastEventAt`) is recorded but doesn't change the subscription ("stale").
 */
export async function processWebhookEvent(
  db: DbClient,
  source: PaymentSource,
  event: NormalizedEvent,
  log: FastifyBaseLogger,
): Promise<WebhookOutcome> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: { source, eventId: event.eventId, type: event.eventType },
      });
      if (event.kind === "ignored") return "ignored";

      const sub = event.subscription;
      if (!sub.userId) {
        // Not created through our checkout (e.g. made by hand in the Paddle dashboard).
        log.warn({ eventId: event.eventId }, "subscription event without customData.userId");
        return "unlinked";
      }
      const user = await tx.user.findUnique({ where: { id: sub.userId }, select: { id: true } });
      if (!user) {
        log.warn({ eventId: event.eventId }, "subscription event for an unknown user");
        return "unlinked";
      }

      const existing = await tx.subscription.findUnique({
        where: { providerSubscriptionId: sub.providerSubscriptionId },
        select: { lastEventAt: true },
      });
      if (existing?.lastEventAt && event.occurredAt < existing.lastEventAt) return "stale";

      const fields = {
        providerCustomerId: sub.providerCustomerId,
        plan: sub.plan,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        lastEventAt: event.occurredAt,
      };
      await tx.subscription.upsert({
        where: { providerSubscriptionId: sub.providerSubscriptionId },
        create: {
          ...fields,
          userId: user.id,
          source,
          providerSubscriptionId: sub.providerSubscriptionId,
        },
        update: fields,
      });
      return "processed";
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }
}
