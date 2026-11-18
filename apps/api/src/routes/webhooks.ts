import type { DbClient } from "@speakup/db";
import { ErrorCode } from "@speakup/shared";
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../plugins/error-handler.js";
import { WebhookSignatureError, type PaymentProvider } from "../services/payments/types.js";
import { processWebhookEvent } from "../services/payments/webhook-processor.js";

/**
 * `POST /v1/webhooks/paddle` (SPEC §8). No Clerk auth: Paddle proves itself with a signature.
 *
 * The signature is an HMAC over the EXACT bytes Paddle sent, so this plugin swaps the JSON parser
 * for a raw-string one — for this route only (Fastify scopes). Parsing and re-serializing the
 * JSON would change whitespace/key order and break verification.
 */
export const webhookRoutes: FastifyPluginAsync<{
  db: DbClient;
  payments: PaymentProvider | null;
}> = async (app, { db, payments }) => {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  // Not rate-limited: Paddle sends bursts from a few IPs; the signature check is the gate.
  app.post("/webhooks/paddle", { config: { rateLimit: false } }, async (request, reply) => {
    if (!payments || payments.source !== "paddle") {
      throw new AppError(503, ErrorCode.NOT_CONFIGURED, "Billing is not configured on this server");
    }
    if (typeof request.body !== "string") {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, "Expected a JSON body");
    }

    let event;
    try {
      event = await payments.verifyAndParseWebhook(request.body, request.headers);
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        request.log.warn("paddle webhook with invalid signature");
        throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Invalid signature");
      }
      throw err;
    }

    const outcome = await processWebhookEvent(db, payments.source, event, request.log);
    request.log.info(
      { eventId: event.eventId, eventType: event.eventType, outcome },
      "paddle webhook handled",
    );
    // 200 for every verified event — including duplicates and ones we ignore — so Paddle stops
    // retrying. Errors (DB down…) throw → 500 → Paddle retries later, which is what we want.
    return reply.code(200).send({ received: true });
  });
};
