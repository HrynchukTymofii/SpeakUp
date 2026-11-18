import { describe, expect, it } from "vitest";
import { hashGuestToken } from "../services/guest-token.js";
import {
  buildTestServer,
  FakeDb,
  FakeQueue,
  FakeRateLimiter,
  FakeStorage,
} from "../testing/fakes.js";

const userAuth = { authorization: "Bearer valid:clerk_1" };
const otherUser = { authorization: "Bearer valid:clerk_2" };
const guest = (token: string) => ({ authorization: `Guest ${token}` });

async function setup() {
  const db = new FakeDb();
  const storage = new FakeStorage();
  const queue = new FakeQueue();
  const rateLimiter = new FakeRateLimiter();
  const app = await buildTestServer({ db, storage, queue, rateLimiter });

  const newSession = async () => {
    const res = await app.inject({ method: "POST", url: "/v1/funnel/sessions" });
    return res.json().token as string;
  };
  const createAttempt = (token: string, turnstileToken = "human") =>
    app.inject({
      method: "POST",
      url: "/v1/funnel/attempts",
      headers: guest(token),
      payload: { mimeType: "audio/webm;codecs=opus", turnstileToken },
    });
  /** Create + simulate the browser's upload + submit. Returns the attempt id. */
  const recordBaseline = async (token: string) => {
    const id: string = (await createAttempt(token)).json().attempt.id;
    const key = db.attempts.find((a) => a.id === id)?.audioKey ?? "";
    storage.objects.set(key, 40_000);
    await app.inject({
      method: "POST",
      url: `/v1/funnel/attempts/${id}/submit`,
      headers: guest(token),
      payload: { durationMs: 30_000 },
    });
    return id;
  };
  const claim = (token: string, headers = userAuth) =>
    app.inject({
      method: "POST",
      url: "/v1/funnel/claim",
      headers,
      payload: { guestToken: token },
    });

  return { app, db, storage, queue, rateLimiter, newSession, createAttempt, recordBaseline, claim };
}

describe("POST /v1/funnel/sessions", () => {
  it("returns a random token and stores only its hash and a hashed IP", async () => {
    const { db, newSession } = await setup();
    const token = await newSession();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    const [session] = db.funnelSessions;
    expect(session?.tokenHash).toBe(hashGuestToken(token));
    expect(JSON.stringify(db.funnelSessions)).not.toContain(token);
    expect(session?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.ipHash).not.toContain("127.0.0.1");
  });
});

describe("PATCH /v1/funnel/sessions/current", () => {
  it("merges answers and remembers the step", async () => {
    const { app, db, newSession } = await setup();
    const token = await newSession();
    const patch = (payload: object) =>
      app.inject({
        method: "PATCH",
        url: "/v1/funnel/sessions/current",
        headers: guest(token),
        payload,
      });

    expect(
      (await patch({ answers: { goal: "presentations" }, currentStep: "goal" })).statusCode,
    ).toBe(204);
    await patch({ answers: { situations: ["meetings"] }, currentStep: "situations" });
    expect(db.funnelSessions[0]).toMatchObject({
      answers: { goal: "presentations", situations: ["meetings"] },
      currentStep: "situations",
    });
  });

  it("rejects values the funnel doesn't offer", async () => {
    const { app, newSession } = await setup();
    const token = await newSession();
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/funnel/sessions/current",
      headers: guest(token),
      payload: { answers: { goal: "hacking" } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("401 without a guest token, or with a Clerk token instead", async () => {
    const { app } = await setup();
    const payload = { answers: {} };
    const url = "/v1/funnel/sessions/current";
    expect((await app.inject({ method: "PATCH", url, payload })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "PATCH", url, payload, headers: userAuth })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "PATCH", url, payload, headers: guest("made-up") })).statusCode,
    ).toBe(401);
  });
});

describe("GET /v1/funnel/exercise", () => {
  it("returns the baseline text for a guest, capped at 45 s", async () => {
    const { app, newSession } = await setup();
    const token = await newSession();
    const res = await app.inject({
      method: "GET",
      url: "/v1/funnel/exercise",
      headers: guest(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().exercise).toMatchObject({ slug: "baseline", type: "read_aloud" });
    expect(res.json().exercise.maxDurationSec).toBeLessThanOrEqual(45);
    expect((await app.inject({ method: "GET", url: "/v1/funnel/exercise" })).statusCode).toBe(401);
  });
});

describe("POST /v1/funnel/attempts", () => {
  it("creates the baseline attempt with a pre-signed upload in the funnel area", async () => {
    const { db, newSession, createAttempt } = await setup();
    const res = await createAttempt(await newSession());
    expect(res.statusCode).toBe(201);
    expect(res.json().upload.url).toBeTruthy();
    const [attempt] = db.attempts;
    expect(attempt).toMatchObject({ userId: null, exerciseId: "ex_baseline" });
    expect(attempt?.funnelSessionId).toBe(db.funnelSessions[0]?.id);
    expect(attempt?.audioKey).toMatch(/^recordings\/funnel\/fs_\d+\/.+\.webm$/);
  });

  it("403 when the bot check fails", async () => {
    const { newSession, createAttempt } = await setup();
    const res = await createAttempt(await newSession(), "robot");
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("BOT_CHECK_FAILED");
  });

  it("only one baseline per session: a second recording after submit is rejected", async () => {
    const { newSession, createAttempt, recordBaseline } = await setup();
    const token = await newSession();
    await recordBaseline(token);
    const res = await createAttempt(token);
    expect(res.statusCode).toBe(409);
  });

  it("a re-take before submitting replaces the attempt and doesn't count against the IP", async () => {
    const { db, rateLimiter, newSession, createAttempt } = await setup();
    const token = await newSession();
    const first = (await createAttempt(token)).json().attempt.id;
    const second = (await createAttempt(token)).json().attempt.id;
    expect(second).not.toBe(first);
    expect(db.attempts.map((a) => a.id)).toEqual([second]);
    expect([...rateLimiter.counts.values()]).toEqual([1]);
  });

  it("429 after the per-IP daily limit (3) across sessions", async () => {
    const { newSession, createAttempt } = await setup();
    for (let i = 0; i < 3; i++) {
      expect((await createAttempt(await newSession())).statusCode).toBe(201);
    }
    const res = await createAttempt(await newSession());
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("submit + status (guest)", () => {
  it("submits and enqueues; status returns progress only, never the result", async () => {
    const { app, queue, newSession, recordBaseline } = await setup();
    const token = await newSession();
    const id = await recordBaseline(token);
    expect(queue.enqueued).toEqual([id]);

    const res = await app.inject({
      method: "GET",
      url: `/v1/funnel/attempts/${id}`,
      headers: guest(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ attempt: { id, status: "queued", stage: "queued" } });
  });

  it("404 for an attempt of another session", async () => {
    const { app, newSession, recordBaseline } = await setup();
    const id = await recordBaseline(await newSession());
    const stranger = await newSession();
    const res = await app.inject({
      method: "GET",
      url: `/v1/funnel/attempts/${id}`,
      headers: guest(stranger),
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a recording longer than 45 s", async () => {
    const { app, db, storage, newSession, createAttempt } = await setup();
    const token = await newSession();
    const id = (await createAttempt(token)).json().attempt.id;
    storage.objects.set(db.attempts[0]?.audioKey ?? "", 40_000);
    const res = await app.inject({
      method: "POST",
      url: `/v1/funnel/attempts/${id}/submit`,
      headers: guest(token),
      payload: { durationMs: 60_000 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/funnel/claim", () => {
  it("moves the attempt to the user and copies the answers into onboarding", async () => {
    const { app, db, newSession, recordBaseline, claim } = await setup();
    const token = await newSession();
    await app.inject({
      method: "PATCH",
      url: "/v1/funnel/sessions/current",
      headers: guest(token),
      payload: { answers: { goal: "job-interviews", "self-rating": 2 } },
    });
    const id = await recordBaseline(token);

    const res = await claim(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ attemptId: id });

    const user = db.users[0];
    expect(db.attempts[0]?.userId).toBe(user?.id);
    expect(db.funnelSessions[0]).toMatchObject({ userId: user?.id });
    expect(db.funnelSessions[0]?.claimedAt).toBeInstanceOf(Date);
    expect(user?.onboarding).toEqual({ goal: "job-interviews", "self-rating": 2 });

    // The owner can now see the attempt through the normal (signed-in) API.
    const detail = await app.inject({
      method: "GET",
      url: `/v1/attempts/${id}`,
      headers: userAuth,
    });
    expect(detail.statusCode).toBe(200);
  });

  it("is idempotent for the same user", async () => {
    const { newSession, recordBaseline, claim } = await setup();
    const token = await newSession();
    const id = await recordBaseline(token);
    await claim(token);
    const again = await claim(token);
    expect(again.statusCode).toBe(200);
    expect(again.json().attemptId).toBe(id);
  });

  it("409 when another account already claimed the session", async () => {
    const { newSession, recordBaseline, claim } = await setup();
    const token = await newSession();
    await recordBaseline(token);
    await claim(token);
    const res = await claim(token, otherUser);
    expect(res.statusCode).toBe(409);
  });

  it("works without a recording (attemptId null), 404 for an unknown token, 401 without sign-in", async () => {
    const { app, newSession, claim } = await setup();
    const token = await newSession();
    expect((await claim(token)).json()).toEqual({ attemptId: null });
    expect((await claim("unknown-token")).statusCode).toBe(404);
    const anonymous = await app.inject({
      method: "POST",
      url: "/v1/funnel/claim",
      payload: { guestToken: token },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("a claimed session can't record another anonymous baseline", async () => {
    const { newSession, createAttempt, claim } = await setup();
    const token = await newSession();
    await claim(token);
    expect((await createAttempt(token)).statusCode).toBe(409);
  });
});
