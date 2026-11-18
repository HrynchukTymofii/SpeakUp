import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildTestServer, FakeDb, FakeQueue, FakeStorage } from "./testing/fakes.js";

const auth = { authorization: "Bearer valid:clerk_1" };

/** Collects everything the logger writes. */
function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { stream, text: () => lines.join("") };
}

/** Every error response has the same shape (SPEC §7). */
function expectErrorShape(json: unknown, code: string) {
  expect(json).toEqual({
    error: { code, message: expect.any(String), requestId: expect.any(String) },
  });
}

describe("global per-IP rate limit", () => {
  it("returns 429 RATE_LIMITED with Retry-After after the limit, in the standard error shape", async () => {
    const app = await buildTestServer({ env: { RATE_LIMIT_PER_MINUTE: 3 } });
    for (let i = 0; i < 3; i++) {
      expect(
        (await app.inject({ method: "GET", url: "/v1/courses", headers: auth })).statusCode,
      ).toBe(200);
    }
    const res = await app.inject({ method: "GET", url: "/v1/courses", headers: auth });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expectErrorShape(res.json(), "RATE_LIMITED");
  });

  it("never limits health checks or provider webhooks", async () => {
    const app = await buildTestServer({ env: { RATE_LIMIT_PER_MINUTE: 2 } });
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
      const webhook = await app.inject({
        method: "POST",
        url: "/v1/webhooks/paddle",
        headers: { "content-type": "application/json", "paddle-signature": "forged" },
        payload: "{}",
      });
      expect(webhook.statusCode).toBe(401); // rejected by the signature check, not by the limiter
    }
  });
});

describe("client IP behind the load balancer (production)", () => {
  it("takes the IP the ALB appended, so a client can't dodge per-IP limits with a fake X-Forwarded-For", async () => {
    const app = await buildTestServer({
      env: { NODE_ENV: "production", RATE_LIMIT_PER_MINUTE: 1, TRUST_PROXY_HOPS: 1 },
    });
    // Same real client (203.0.113.9, appended by the ALB at 10.0.0.5); different spoofed prefixes.
    const send = (spoofed: string) =>
      app.inject({
        method: "GET",
        url: "/v1/courses",
        remoteAddress: "10.0.0.5",
        headers: { ...auth, "x-forwarded-for": `${spoofed}, 203.0.113.9` },
      });
    expect((await send("1.1.1.1")).statusCode).toBe(200);
    expect((await send("2.2.2.2")).statusCode).toBe(429);
  });
});

describe("per-user limit on POST /v1/attempts", () => {
  it("allows ATTEMPTS_PER_MINUTE recordings, then 429 with Retry-After: 60", async () => {
    const app = await buildTestServer({ env: { ATTEMPTS_PER_MINUTE: 2, FREE_DAILY_ANALYSES: 10 } });
    const create = () =>
      app.inject({
        method: "POST",
        url: "/v1/attempts",
        headers: auth,
        payload: { exerciseId: "ex_find-your-pace-read", mimeType: "audio/webm" },
      });
    expect((await create()).statusCode).toBe(201);
    expect((await create()).statusCode).toBe(201);
    const res = await create();
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("60");
    expectErrorShape(res.json(), "RATE_LIMITED");
  });
});

describe("standard error format for framework errors", () => {
  it("malformed JSON → 400 BAD_REQUEST", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding",
      headers: { ...auth, "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expectErrorShape(res.json(), "BAD_REQUEST");
  });

  // (text/plain has a built-in Fastify parser and then fails our Zod validation → 400; a type
  // with no parser at all is the 415 case.)
  it("unsupported content type → 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding",
      headers: { ...auth, "content-type": "application/xml" },
      payload: "<answers/>",
    });
    expect(res.statusCode).toBe(415);
    expectErrorShape(res.json(), "UNSUPPORTED_MEDIA_TYPE");
  });

  it("body over 100 KB → 413 PAYLOAD_TOO_LARGE", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding",
      headers: { ...auth, "content-type": "application/json" },
      payload: JSON.stringify({ answers: { x: "a".repeat(200_000) } }),
    });
    expect(res.statusCode).toBe(413);
    expectErrorShape(res.json(), "PAYLOAD_TOO_LARGE");
  });

  it("unknown route → 404 NOT_FOUND", async () => {
    const app = await buildTestServer();
    const res = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(res.statusCode).toBe(404);
    expectErrorShape(res.json(), "NOT_FOUND");
  });

  it("uses the client's x-request-id in the error body (support can find the log line)", async () => {
    const app = await buildTestServer();
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { "x-request-id": "req-123" },
    });
    expect(res.json().error.requestId).toBe("req-123");
  });
});

describe("log redaction (SPEC §9)", () => {
  it("never writes tokens, guest tokens, signatures or emails to the logs", async () => {
    const logs = captureLogs();
    const app = await buildTestServer({ logStream: logs.stream });

    await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer secret-clerk-jwt" },
    });
    await app.inject({
      method: "PATCH",
      url: "/v1/funnel/sessions/current",
      headers: { authorization: "Guest secret-guest-token" },
      payload: { answers: {} },
    });
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/paddle",
      headers: { "content-type": "application/json", "paddle-signature": "ts=1;h1=secret-sig" },
      payload: "{}",
    });
    // Even if a developer logs something sensitive by mistake:
    app.log.info(
      { email: "person@example.com", attemptId: "att_1", transcript: "my words" },
      "oops",
    );
    app.log.info({ attempt: { email: "nested@example.com" } }, "nested");

    const text = logs.text();
    expect(text).toContain("att_1"); // ids are still logged
    expect(text).toContain("/v1/me"); // request paths too
    for (const secret of [
      "secret-clerk-jwt",
      "secret-guest-token",
      "secret-sig",
      "person@example.com",
      "nested@example.com",
      "my words",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("request id travels to the worker", () => {
  it("passes the HTTP request id with the analysis job", async () => {
    const db = new FakeDb();
    const storage = new FakeStorage();
    const queue = new FakeQueue();
    const app = await buildTestServer({ db, storage, queue });
    const created = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: auth,
      payload: { exerciseId: "ex_find-your-pace-read", mimeType: "audio/webm" },
    });
    const id: string = created.json().attempt.id;
    storage.objects.set(db.attempts[0]?.audioKey ?? "", 50_000);
    await app.inject({
      method: "POST",
      url: `/v1/attempts/${id}/submit`,
      headers: { ...auth, "x-request-id": "req-submit-1" },
      payload: { durationMs: 20_000 },
    });
    expect(queue.enqueued).toEqual([id]);
    expect(queue.requestIds).toEqual(["req-submit-1"]);
  });
});
