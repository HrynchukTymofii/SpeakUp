import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ErrorReporter } from "../services/error-reporter.js";
import { AppError, setupErrorHandling } from "./error-handler.js";

function recordingReporter() {
  const captured: { err: unknown; tags: Record<string, string> }[] = [];
  const reporter: ErrorReporter = {
    capture: (err, tags) => captured.push({ err, tags }),
    flush: async () => {},
  };
  return { reporter, captured };
}

async function appThatThrows(error: unknown, reporter: ErrorReporter) {
  const app = Fastify({ logger: false });
  setupErrorHandling(app, reporter);
  app.get("/v1/things/:id", () => {
    throw error;
  });
  await app.ready();
  return app;
}

describe("error reporting (Sentry) from the API error handler", () => {
  it("reports an unexpected error with the request id and route, and still answers 500", async () => {
    const { reporter, captured } = recordingReporter();
    const boom = new Error("db exploded");
    const app = await appThatThrows(boom, reporter);

    const res = await app.inject({
      url: "/v1/things/42",
      headers: { "x-request-id": "req-1" },
    });

    expect(res.statusCode).toBe(500);
    expect(captured).toEqual([
      { err: boom, tags: { requestId: res.json().error.requestId, route: "/v1/things/:id" } },
    ]);
  });

  it("reports an AppError with a 5xx status", async () => {
    const { reporter, captured } = recordingReporter();
    const app = await appThatThrows(new AppError(502, "UPSTREAM", "provider down"), reporter);
    await app.inject({ url: "/v1/things/1" });
    expect(captured).toHaveLength(1);
  });

  it("never reports expected client errors (4xx)", async () => {
    const { reporter, captured } = recordingReporter();
    const app = await appThatThrows(new AppError(403, "FORBIDDEN", "not yours"), reporter);
    const res = await app.inject({ url: "/v1/things/1" });
    expect(res.statusCode).toBe(403);
    expect(captured).toEqual([]);
  });

  it("works without a reporter (error tracking off)", async () => {
    const app = Fastify({ logger: false });
    setupErrorHandling(app);
    app.get("/x", () => {
      throw new Error("boom");
    });
    expect((await app.inject({ url: "/x" })).statusCode).toBe(500);
  });
});
