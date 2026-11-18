import type { DbClient } from "@speakup/db";
import {
  BillingPlansResponseSchema,
  CheckoutBodySchema,
  CheckoutResponseSchema,
  ErrorCode,
  PortalResponseSchema,
} from "@speakup/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { currentUser } from "../plugins/auth.js";
import { AppError } from "../plugins/error-handler.js";
import { getEntitlements, latestSubscription } from "../services/entitlements.js";
import type { PaymentProvider } from "../services/payments/types.js";

/** Billing keys missing (local dev without Paddle): a clear 503 instead of a crash. */
function requireProvider(payments: PaymentProvider | null): PaymentProvider {
  if (!payments) {
    throw new AppError(503, ErrorCode.NOT_CONFIGURED, "Billing is not configured on this server");
  }
  return payments;
}

/** Public: the plans on sale (the pricing page previews localized prices with these ids). */
export const billingPublicRoutes: FastifyPluginAsyncZod<{
  payments: PaymentProvider | null;
}> = async (app, { payments }) => {
  app.get(
    "/billing/plans",
    { schema: { response: { 200: BillingPlansResponseSchema } } },
    async () => ({
      plans: requireProvider(payments).plans(),
    }),
  );
};

/** Signed-in billing routes. Must be registered inside a `requireAuth` scope. */
export const billingRoutes: FastifyPluginAsyncZod<{
  db: DbClient;
  payments: PaymentProvider | null;
  limits: { free: number; pro: number };
}> = async (app, { db, payments, limits }) => {
  /**
   * Data for Paddle.js to open the checkout. We don't grant anything here: the user becomes Pro
   * only when Paddle's webhook says the subscription is active (never trust the client's
   * "payment succeeded" redirect — SPEC §8).
   */
  app.post(
    "/billing/checkout",
    { schema: { body: CheckoutBodySchema, response: { 200: CheckoutResponseSchema } } },
    async (request) => {
      const provider = requireProvider(payments);
      const user = currentUser(request);
      const { plan } = await getEntitlements(db, user.id, limits);
      if (plan === "pro") {
        throw new AppError(409, ErrorCode.WRONG_STATE, "You already have SpeakUp Pro");
      }
      request.log.info({ userId: user.id, plan: request.body.plan }, "checkout started");
      return provider.createCheckout(user, request.body.plan);
    },
  );

  /** A one-time link to Paddle's customer portal: change card, see invoices, cancel. */
  app.post(
    "/billing/portal",
    { schema: { response: { 200: PortalResponseSchema } } },
    async (request) => {
      const provider = requireProvider(payments);
      const sub = await latestSubscription(db, currentUser(request).id);
      if (!sub || sub.source !== provider.source || !sub.providerCustomerId) {
        throw new AppError(404, ErrorCode.NOT_FOUND, "No subscription to manage");
      }
      return {
        url: await provider.getPortalUrl({
          providerCustomerId: sub.providerCustomerId,
          providerSubscriptionId: sub.providerSubscriptionId,
        }),
      };
    },
  );
};
