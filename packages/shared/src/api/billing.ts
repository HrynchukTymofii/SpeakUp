import { z } from "zod";

/**
 * Billing contracts (SPEC §8). The web app never decides who is Pro: it only opens the checkout.
 * Paddle's webhook is the source of truth for entitlements.
 */
export const BillingPlanIdSchema = z.enum(["pro_monthly"]);
export type BillingPlanId = z.infer<typeof BillingPlanIdSchema>;

/** GET /v1/billing/plans (public): which Paddle prices to show/preview. */
export const BillingPlansResponseSchema = z.object({
  plans: z.array(z.object({ id: BillingPlanIdSchema, priceId: z.string() })),
});
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;

/** POST /v1/billing/checkout body. */
export const CheckoutBodySchema = z.strictObject({ plan: BillingPlanIdSchema });
export type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

/**
 * POST /v1/billing/checkout → everything Paddle.js needs to open the overlay checkout.
 * `customData.userId` comes back on every webhook, which is how a payment is tied to our user.
 */
export const CheckoutResponseSchema = z.object({
  priceId: z.string(),
  customData: z.object({ userId: z.string() }),
  customerEmail: z.string().nullable(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

/** POST /v1/billing/portal → a short-lived link to Paddle's customer portal (manage / cancel). */
export const PortalResponseSchema = z.object({ url: z.url() });
export type PortalResponse = z.infer<typeof PortalResponseSchema>;
