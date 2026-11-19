import { describe, expect, it } from "vitest";
import { buildTestServer, FakeAuth, FakeDb } from "../testing/fakes.js";

const auth = (clerkUserId: string) => ({ authorization: `Bearer valid:${clerkUserId}` });

describe("GET /v1/me — authentication", () => {
  it("401 without an Authorization header, in the standard error format", async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: "GET", url: "/v1/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });

  it("401 with a non-Bearer scheme", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Basic abc" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("401 with an invalid token", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer forged" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /v1/me — lazy provisioning + profile", () => {
  it("survives concurrent first requests (the losing upsert hits the unique constraint)", async () => {
    // Regression: a new user's first screen fires several requests at once. Each saw "no user",
    // each upserted, and Postgres rejected all but one with P2002 → 500 on the others.
    const db = new FakeDb();
    db.simulateProvisioningRace = true;
    const app = await buildTestServer({ db, auth: new FakeAuth() });

    const res = await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_1") });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe("user_1");
    expect(db.users).toHaveLength(1);
  });

  it("creates the user on first request (with email) and reuses it afterwards", async () => {
    const db = new FakeDb();
    const fakeAuth = new FakeAuth();
    const app = await buildTestServer({ db, auth: fakeAuth });

    const first = await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_1") });
    const second = await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_1") });

    expect(first.statusCode).toBe(200);
    expect(second.json().user.id).toBe(first.json().user.id);
    expect(db.users).toHaveLength(1);
    expect(fakeAuth.emailLookups).toBe(1); // Clerk API hit only on creation
    expect(first.json()).toEqual({
      user: {
        id: "user_1",
        email: "clerk_1@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        onboarding: null,
      },
      entitlements: { plan: "free", dailyAnalysesLimit: 3 },
      usage: { analysesToday: 0 },
      subscription: null,
    });
  });

  it("still signs the user in when the email lookup fails", async () => {
    const fakeAuth = new FakeAuth();
    fakeAuth.failEmailLookup = true;
    const app = await buildTestServer({ auth: fakeAuth });
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_2") });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBeNull();
  });

  it("reports Pro entitlements and today's usage", async () => {
    const db = new FakeDb();
    const app = await buildTestServer({ db });
    await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_3") }); // provision
    db.makePro("user_1");
    db.attemptsToday = 2;

    const res = await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_3") });
    expect(res.json().entitlements).toEqual({ plan: "pro", dailyAnalysesLimit: 50 });
    expect(res.json().usage).toEqual({ analysesToday: 2 });
    expect(res.json().subscription).toEqual({
      status: "active",
      currentPeriodEnd: null,
      manageable: true,
    });
  });
});

describe("PUT /v1/me/onboarding", () => {
  it("saves answers and returns the updated profile", async () => {
    const app = await buildTestServer();
    const answers = { goal: "presentations", situations: ["meetings"], "self-rating": 2 };
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding",
      headers: auth("clerk_4"),
      payload: { answers },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.onboarding).toEqual(answers);

    const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth("clerk_4") });
    expect(me.json().user.onboarding).toEqual(answers);
  });

  it("400 VALIDATION_ERROR for unknown fields (e.g. trying to set another userId)", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding",
      headers: auth("clerk_5"),
      payload: { answers: {}, userId: "victim" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("401 without a token (auth runs before validation)", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding",
      payload: { answers: {} },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("unknown routes", () => {
  it("404 in the standard error format", async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: "GET", url: "/v1/nope", headers: auth("x") });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
