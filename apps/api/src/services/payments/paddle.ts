import { Environment, EventName, Paddle } from "@paddle/paddle-node-sdk";
import { z } from "zod";
import {
  WebhookSignatureError,
  type NormalizedEvent,
  type PaymentProvider,
  type SubscriptionStatus,
} from "./types.js";

/** The fields of a Paddle subscription event we use (SDK entity, camelCase). */
interface PaddleSubscriptionData {
  id: string;
  status: "active" | "canceled" | "past_due" | "paused" | "trialing";
  customerId: string;
  customData: unknown;
  currentBillingPeriod: { endsAt: string } | null;
  items: { price: { id: string } | null }[];
}

const SUBSCRIPTION_EVENTS = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionTrialing,
]);

/**
 * Paddle → our statuses. Paddle's `paused` has no own value in our enum; a paused subscription
 * grants no access, which is exactly what `canceled` means for entitlements.
 */
const STATUS: Record<PaddleSubscriptionData["status"], SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  paused: "canceled",
};

const CustomDataSchema = z.object({ userId: z.string().min(1) });

export function createPaddleProvider(opts: {
  apiKey: string;
  webhookSecret: string;
  priceIdProMonthly: string;
  environment: "sandbox" | "production";
}): PaymentProvider {
  const paddle = new Paddle(opts.apiKey, {
    environment: opts.environment === "production" ? Environment.production : Environment.sandbox,
  });

  return {
    source: "paddle",

    plans: () => [{ id: "pro_monthly", priceId: opts.priceIdProMonthly }],

    createCheckout: (user) => ({
      priceId: opts.priceIdProMonthly,
      customData: { userId: user.id },
      customerEmail: user.email,
    }),

    async getPortalUrl({ providerCustomerId, providerSubscriptionId }) {
      const session = await paddle.customerPortalSessions.create(providerCustomerId, [
        providerSubscriptionId,
      ]);
      return session.urls.general.overview;
    },

    async verifyAndParseWebhook(rawBody, headers) {
      const signature = headers["paddle-signature"];
      if (typeof signature !== "string" || !signature) throw new WebhookSignatureError();

      let event;
      try {
        // Verifies the HMAC over the exact raw body and rejects old timestamps (replay attack).
        event = await paddle.webhooks.unmarshal(rawBody, opts.webhookSecret, signature);
      } catch {
        throw new WebhookSignatureError();
      }

      const base = {
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: new Date(event.occurredAt),
      };
      if (!SUBSCRIPTION_EVENTS.has(event.eventType)) return { kind: "ignored", ...base };

      const data = event.data as PaddleSubscriptionData;
      const custom = CustomDataSchema.safeParse(data.customData);
      const priceIds = data.items.map((item) => item.price?.id);
      return {
        kind: "subscription",
        ...base,
        subscription: {
          providerSubscriptionId: data.id,
          providerCustomerId: data.customerId,
          userId: custom.success ? custom.data.userId : null,
          // Only our Pro price grants Pro; anything else sold in the account doesn't.
          plan: priceIds.includes(opts.priceIdProMonthly) ? "pro" : "free",
          status: STATUS[data.status],
          currentPeriodEnd: data.currentBillingPeriod
            ? new Date(data.currentBillingPeriod.endsAt)
            : null,
        },
      } satisfies NormalizedEvent;
    },
  };
}
