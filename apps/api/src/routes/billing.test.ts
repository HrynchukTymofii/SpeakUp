import { describe, expect, it } from "vitest";
import { buildTestServer, FakeDb } from "../testing/fakes.js";

const auth = { authorization: "Bearer valid:clerk_1" };

async function setup(opts: { billing?: boolean } = {}) {
  const db = new FakeDb();
  const app = await buildTestServer({ db, ...(opts.billing === false && { payments: null }) });
  await app.inject({ method: "GET", url: "/v1/me", headers: auth }); // provisions user_1
  return { app, db };
}

/** Sends a (fake-signed) webhook. The body is our normalized event as JSON. */
function webhook(
  app: Awaited<ReturnType<typeof setup>>["app"],
  event: object,
  signature = "valid",
) {
  return app.inject({
    method: "POST",
    url: "/v1/webhooks/paddle",
    headers: { "content-type": "application/json", "paddle-signature": signature },
    payload: JSON.stringify(event),
  });
}

const subscriptionEvent = (over: {
  eventId?: string;
  occurredAt?: string;
  status?: string;
  userId?: string | null;
}) => ({
  kind: "subscription",
  eventId: over.eventId ?? "evt_1",
  eventType: "subscription.created",
  occurredAt: over.occurredAt ?? "2026-11-18T10:00:00Z",
  subscription: {
    providerSubscriptionId: "sub_1",
    providerCustomerId: "ctm_1",
    userId: over.userId === undefined ? "user_1" : over.userId,
    plan: "pro",
    status: over.status ?? "active",
    currentPeriodEnd: "2099-12-18T10:00:00Z",
  },
});

const plan = async (app: Awaited<ReturnType<typeof setup>>["app"]) =>
  (await app.inject({ method: "GET", url: "/v1/me", headers: auth })).json().entitlements.plan;

describe("POST /v1/webhooks/paddle", () => {
  it("a verified subscription.created makes the user Pro", async () => {
    const { app, db } = await setup();
    expect(await plan(app)).toBe("free");
    const res = await webhook(app, subscriptionEvent({}));
    expect(res.statusCode).toBe(200);
    expect(await plan(app)).toBe("pro");
    expect(db.subscriptions[0]).toMatchObject({
      userId: "user_1",
      source: "paddle",
      providerCustomerId: "ctm_1",
      status: "active",
    });
  });

  it("rejects an invalid signature with 401 and changes nothing", async () => {
    const { app, db } = await setup();
    const res = await webhook(app, subscriptionEvent({}), "forged");
    expect(res.statusCode).toBe(401);
    expect(db.subscriptions).toHaveLength(0);
    expect(db.webhookEvents).toHaveLength(0);
  });

  it("a replayed event (same id) is a no-op that still answers 200", async () => {
    const { app, db } = await setup();
    await webhook(app, subscriptionEvent({ eventId: "evt_1" }));
    // Same event id, different content: must NOT be applied again.
    const replay = await webhook(
      app,
      subscriptionEvent({
        eventId: "evt_1",
        status: "canceled",
        occurredAt: "2026-11-19T00:00:00Z",
      }),
    );
    expect(replay.statusCode).toBe(200);
    expect(db.webhookEvents).toHaveLength(1);
    expect(db.subscriptions[0]?.status).toBe("active");
  });

  it("ignores an older event that arrives after a newer one (out-of-order delivery)", async () => {
    const { app, db } = await setup();
    await webhook(
      app,
      subscriptionEvent({
        eventId: "evt_new",
        status: "canceled",
        occurredAt: "2026-11-18T12:00:00Z",
      }),
    );
    await webhook(
      app,
      subscriptionEvent({
        eventId: "evt_old",
        status: "active",
        occurredAt: "2026-11-18T10:00:00Z",
      }),
    );
    expect(db.subscriptions[0]?.status).toBe("canceled");
    expect(await plan(app)).toBe("free");
    expect(db.webhookEvents).toHaveLength(2); // both recorded
  });

  it("cancellation removes Pro", async () => {
    const { app } = await setup();
    await webhook(app, subscriptionEvent({ eventId: "evt_1" }));
    await webhook(
      app,
      subscriptionEvent({
        eventId: "evt_2",
        status: "canceled",
        occurredAt: "2026-11-20T00:00:00Z",
      }),
    );
    expect(await plan(app)).toBe("free");
  });

  it("events without our userId (or for an unknown user) are recorded but not applied", async () => {
    const { app, db } = await setup();
    expect((await webhook(app, subscriptionEvent({ eventId: "a", userId: null }))).statusCode).toBe(
      200,
    );
    expect(
      (await webhook(app, subscriptionEvent({ eventId: "b", userId: "user_999" }))).statusCode,
    ).toBe(200);
    expect(db.subscriptions).toHaveLength(0);
    expect(db.webhookEvents).toHaveLength(2);
  });

  it("other event types are acknowledged and recorded", async () => {
    const { app, db } = await setup();
    const res = await webhook(app, {
      kind: "ignored",
      eventId: "evt_tx",
      eventType: "transaction.completed",
      occurredAt: "2026-11-18T10:00:00Z",
    });
    expect(res.statusCode).toBe(200);
    expect(db.webhookEvents).toHaveLength(1);
  });

  it("503 when billing isn't configured", async () => {
    const { app } = await setup({ billing: false });
    expect((await webhook(app, subscriptionEvent({}))).statusCode).toBe(503);
  });
});

describe("billing routes", () => {
  it("GET /v1/billing/plans is public", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/billing/plans" });
    expect(res.json()).toEqual({ plans: [{ id: "pro_monthly", priceId: "pri_test_monthly" }] });
  });

  it("checkout returns Paddle.js data tied to the user (identity from the token only)", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: auth,
      payload: { plan: "pro_monthly" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      priceId: "pri_test_monthly",
      customData: { userId: "user_1" },
      customerEmail: "clerk_1@example.com",
    });
  });

  it("checkout: 409 when already Pro, 400 for unknown fields, 401 signed out", async () => {
    const { app, db } = await setup();
    const checkout = (payload: object, headers: Record<string, string> = auth) =>
      app.inject({ method: "POST", url: "/v1/billing/checkout", headers, payload });
    expect((await checkout({ plan: "pro_monthly", userId: "someone-else" })).statusCode).toBe(400);
    expect((await checkout({ plan: "pro_monthly" }, {})).statusCode).toBe(401);
    db.makePro("user_1");
    expect((await checkout({ plan: "pro_monthly" })).statusCode).toBe(409);
  });

  it("portal: 404 without a subscription, a URL with one", async () => {
    const { app, db } = await setup();
    const portal = () => app.inject({ method: "POST", url: "/v1/billing/portal", headers: auth });
    expect((await portal()).statusCode).toBe(404);
    db.makePro("user_1");
    expect((await portal()).json().url).toBe("https://sandbox-customer-portal.paddle.com/ctm_test");
  });

  it("503 NOT_CONFIGURED without Paddle keys", async () => {
    const { app } = await setup({ billing: false });
    const res = await app.inject({ method: "GET", url: "/v1/billing/plans" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("NOT_CONFIGURED");
  });
});
