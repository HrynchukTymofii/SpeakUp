import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPaddleProvider } from "./paddle.js";
import { WebhookSignatureError } from "./types.js";

const SECRET = "pdl_ntfset_test_secret";
const provider = createPaddleProvider({
  apiKey: "pdl_sdbx_apikey_test",
  webhookSecret: SECRET,
  priceIdProMonthly: "pri_pro",
  environment: "sandbox",
});

/** Signs a body exactly like Paddle: `ts=<unix>;h1=HMAC_SHA256(secret, "<ts>:<body>")`. */
function sign(body: string, ts = Math.floor(Date.now() / 1000)): string {
  const h1 = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

/** A realistic Paddle subscription webhook (snake_case, as Paddle sends it). */
function paddleEvent(over: {
  eventType?: string;
  status?: string;
  priceId?: string;
  customData?: unknown;
}) {
  const now = "2026-11-18T10:00:00.000000Z";
  return JSON.stringify({
    event_id: "evt_01test",
    event_type: over.eventType ?? "subscription.created",
    occurred_at: now,
    notification_id: "ntf_01test",
    data: {
      id: "sub_01test",
      status: over.status ?? "active",
      customer_id: "ctm_01test",
      address_id: "add_01test",
      business_id: null,
      currency_code: "USD",
      created_at: now,
      updated_at: now,
      started_at: now,
      first_billed_at: now,
      next_billed_at: "2026-12-18T10:00:00.000000Z",
      paused_at: null,
      canceled_at: null,
      discount: null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: { starts_at: now, ends_at: "2026-12-18T10:00:00.000000Z" },
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: [
        {
          status: "active",
          quantity: 1,
          recurring: true,
          created_at: now,
          updated_at: now,
          previously_billed_at: now,
          next_billed_at: "2026-12-18T10:00:00.000000Z",
          trial_dates: null,
          price: { id: over.priceId ?? "pri_pro", product_id: "pro_01test" },
        },
      ],
      custom_data: over.customData === undefined ? { userId: "user_1" } : over.customData,
      import_meta: null,
    },
  });
}

describe("Paddle provider: webhook verification + normalization", () => {
  it("verifies a correctly signed subscription event and maps it to our terms", async () => {
    const body = paddleEvent({});
    const event = await provider.verifyAndParseWebhook(body, { "paddle-signature": sign(body) });
    expect(event).toEqual({
      kind: "subscription",
      eventId: "evt_01test",
      eventType: "subscription.created",
      occurredAt: new Date("2026-11-18T10:00:00.000Z"),
      subscription: {
        providerSubscriptionId: "sub_01test",
        providerCustomerId: "ctm_01test",
        userId: "user_1",
        plan: "pro",
        status: "active",
        currentPeriodEnd: new Date("2026-12-18T10:00:00.000Z"),
      },
    });
  });

  it("rejects a tampered body, a wrong secret, an old timestamp and a missing header", async () => {
    const body = paddleEvent({});
    const tampered = body.replace("user_1", "user_2");
    await expect(
      provider.verifyAndParseWebhook(tampered, { "paddle-signature": sign(body) }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);

    const wrongSecret = `ts=${Math.floor(Date.now() / 1000)};h1=${createHmac("sha256", "nope").update("x").digest("hex")}`;
    await expect(
      provider.verifyAndParseWebhook(body, { "paddle-signature": wrongSecret }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);

    // A captured request replayed an hour later: the signature is valid but too old.
    const old = sign(body, Math.floor(Date.now() / 1000) - 3600);
    await expect(
      provider.verifyAndParseWebhook(body, { "paddle-signature": old }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);

    await expect(provider.verifyAndParseWebhook(body, {})).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("maps paused → canceled (no access) and a foreign price → free", async () => {
    const paused = paddleEvent({ eventType: "subscription.paused", status: "paused" });
    const e1 = await provider.verifyAndParseWebhook(paused, { "paddle-signature": sign(paused) });
    expect(e1.kind === "subscription" && e1.subscription.status).toBe("canceled");

    const other = paddleEvent({ priceId: "pri_something_else" });
    const e2 = await provider.verifyAndParseWebhook(other, { "paddle-signature": sign(other) });
    expect(e2.kind === "subscription" && e2.subscription.plan).toBe("free");
  });

  it("missing customData.userId → userId null (recorded, not applied)", async () => {
    const body = paddleEvent({ customData: null });
    const event = await provider.verifyAndParseWebhook(body, { "paddle-signature": sign(body) });
    expect(event.kind === "subscription" && event.subscription.userId).toBeNull();
  });

  it("non-subscription events are 'ignored'", async () => {
    const body = JSON.stringify({
      event_id: "evt_tx",
      event_type: "customer.created",
      occurred_at: "2026-11-18T10:00:00Z",
      notification_id: "ntf_x",
      data: {
        id: "ctm_1",
        name: null,
        email: "a@b.c",
        marketing_consent: false,
        status: "active",
        custom_data: null,
        locale: "en",
        created_at: "2026-11-18T10:00:00Z",
        updated_at: "2026-11-18T10:00:00Z",
        import_meta: null,
      },
    });
    const event = await provider.verifyAndParseWebhook(body, { "paddle-signature": sign(body) });
    expect(event).toMatchObject({
      kind: "ignored",
      eventId: "evt_tx",
      eventType: "customer.created",
    });
  });

  it("checkout data carries our user id as customData", () => {
    expect(provider.createCheckout({ id: "user_1", email: "a@b.c" }, "pro_monthly")).toEqual({
      priceId: "pri_pro",
      customData: { userId: "user_1" },
      customerEmail: "a@b.c",
    });
  });
});
