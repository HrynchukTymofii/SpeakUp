import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import {
  FakeAuth,
  FakeDb,
  FakeBotCheck,
  FakeQueue,
  FakeRateLimiter,
  FakeStorage,
  testEnv,
} from "../testing/fakes.js";
import type { HealthCheck } from "./health.js";

const up: HealthCheck = async () => {};
const down: HealthCheck = async () => {
  throw new Error("ECONNREFUSED");
};

function build(db: HealthCheck, redis: HealthCheck) {
  return buildServer({
    env: testEnv,
    db: new FakeDb().asClient(),
    auth: new FakeAuth(),
    storage: new FakeStorage(),
    queue: new FakeQueue(),
    botCheck: new FakeBotCheck(),
    rateLimiter: new FakeRateLimiter(),
    payments: null,
    healthChecks: { db, redis },
  });
}

describe("health routes", () => {
  it("GET /health is ok even when dependencies are down", async () => {
    const app = await build(down, down);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /health/ready is 200 when DB and Redis are up", async () => {
    const app = await build(up, up);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: { db: "ok", redis: "ok" } });
  });

  it("GET /health/ready is 503 when the DB is down", async () => {
    const app = await build(down, up);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", checks: { db: "fail", redis: "ok" } });
  });

  it("GET /health/ready is 503 when Redis is down", async () => {
    const app = await build(up, down);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", checks: { db: "ok", redis: "fail" } });
  });

  it("health routes need no auth token", async () => {
    const app = await build(up, up);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).not.toBe(401);
  });

  it("sets security headers via helmet", async () => {
    const app = await build(up, up);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
