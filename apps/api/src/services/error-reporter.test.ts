import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createErrorReporter } from "./error-reporter.js";

/**
 * The real Sentry SDK against a local stand-in for sentry.io: proves what actually leaves the
 * process (SPEC §9), not just what our scrub function returns.
 */
describe("createErrorReporter (real SDK, local ingest)", () => {
  let server: Server;
  const received: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        received.push(body);
        res.writeHead(200).end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    await Sentry.close(1000);
    await new Promise((resolve) => server.close(resolve));
  });

  it("sends the error with its tags, and none of the request's secrets", async () => {
    const { port } = server.address() as AddressInfo;
    const reporter = createErrorReporter({
      dsn: `http://publickey@127.0.0.1:${port}/1`,
      environment: "test",
      service: "api",
    });

    Sentry.withScope((scope) => {
      // What an instrumented request could attach to the scope.
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          url: "https://api.speakup.test/v1/attempts/a1?guest=raw-guest-token",
          method: "POST",
          headers: { authorization: "Bearer secret-jwt", "user-agent": "UA/1" },
          cookies: { __session: "cookie-secret" },
          data: { transcript: "my private story" },
        },
      });
      scope.setUser({ id: "user_1", email: "ann@example.com", ip_address: "1.2.3.4" });
      scope.setExtra("transcript", "my private story");
      reporter.capture(new Error("db exploded"), { requestId: "req-1", route: "/v1/attempts" });
    });
    await reporter.flush(2000);

    const sent = received.join("\n");
    expect(sent).toContain("db exploded");
    expect(sent).toContain("req-1");
    expect(sent).toContain('"service":"api"');
    for (const secret of [
      "secret-jwt",
      "raw-guest-token",
      "cookie-secret",
      "my private story",
      "ann@example.com",
      "1.2.3.4",
    ]) {
      expect(sent, secret).not.toContain(secret);
    }
  });
});
