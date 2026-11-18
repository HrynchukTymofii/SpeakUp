import type { BillingPlanId, CheckoutResponse } from "@speakup/shared";

/** Our own subscription vocabulary (matches the `SubStatus` / `Plan` DB enums). */
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";
export type PaymentSource = "paddle" | "stripe" | "app_store" | "play_store";

/**
 * A provider webhook translated into our terms. Routes and DB code only ever see this shape, so
 * adding Stripe (or RevenueCat for app stores) = a new provider file, no route changes (SPEC §8).
 */
export type NormalizedEvent =
  | {
      kind: "subscription";
      eventId: string;
      eventType: string;
      occurredAt: Date;
      subscription: {
        providerSubscriptionId: string;
        providerCustomerId: string | null;
        /** From the checkout's customData — how the payment is tied to our user. */
        userId: string | null;
        plan: "free" | "pro";
        status: SubscriptionStatus;
        currentPeriodEnd: Date | null;
      };
    }
  /** Events we don't act on (transactions, customers…) — still recorded for idempotency. */
  | { kind: "ignored"; eventId: string; eventType: string; occurredAt: Date };

/** The webhook's signature didn't verify → 401, never processed. */
export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** SPEC §8 `PaymentProvider`. */
export interface PaymentProvider {
  readonly source: PaymentSource;
  /** Plans on sale and their provider price ids (public — shown on the pricing page). */
  plans(): { id: BillingPlanId; priceId: string }[];
  /** Data for the client-side checkout overlay. No API call: the overlay creates the transaction. */
  createCheckout(user: { id: string; email: string | null }, plan: BillingPlanId): CheckoutResponse;
  /** A short-lived link to the provider's customer portal (manage, cancel, update card). */
  getPortalUrl(sub: {
    providerCustomerId: string;
    providerSubscriptionId: string;
  }): Promise<string>;
  /** Verifies the signature and normalizes the event. Throws WebhookSignatureError if invalid. */
  verifyAndParseWebhook(
    rawBody: string,
    headers: Record<string, unknown>,
  ): Promise<NormalizedEvent>;
}
