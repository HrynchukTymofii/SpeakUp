import { describe, expect, it } from "vitest";
import { scrubErrorEvent, type ScrubbableEvent } from "./error-reporting.js";

describe("scrubErrorEvent (what may leave for the error tracker)", () => {
  it("drops credentials, bodies and query strings from the request", () => {
    const event = scrubErrorEvent({
      request: {
        url: "https://api.speakup.test/v1/attempts/abc?guest=secret",
        method: "POST",
        headers: {
          authorization: "Bearer eyJ...",
          cookie: "__session=abc",
          "paddle-signature": "ts=1;h1=x",
          "user-agent": "Mozilla/5.0",
          "content-type": "application/json",
        },
        cookies: { __session: "abc" },
        data: { transcript: "my private story" },
        query_string: "guest=secret",
      },
    });
    expect(event.request).toEqual({
      url: "https://api.speakup.test/v1/attempts/abc",
      method: "POST",
      headers: { "user-agent": "Mozilla/5.0", "content-type": "application/json" },
    });
  });

  it("keeps only the internal user id, never email, name or IP", () => {
    const event = scrubErrorEvent({
      user: { id: "user_1", email: "a@b.c", username: "ann", ip_address: "1.2.3.4" },
    });
    expect(event.user).toEqual({ id: "user_1" });
  });

  it("redacts sensitive keys in extra data, like the loggers do", () => {
    const event = scrubErrorEvent({
      extra: { attemptId: "att_1", transcript: "hello", downloadUrl: "https://s3/..." },
    });
    expect(event.extra).toEqual({
      attemptId: "att_1",
      transcript: "[redacted]",
      downloadUrl: "[redacted]",
    });
  });

  it("drops breadcrumbs (they can hold URLs with signed queries)", () => {
    const event = scrubErrorEvent({
      breadcrumbs: [{ message: "GET https://s3/?X-Amz-Signature=x" }],
    });
    expect(event.breadcrumbs).toBeUndefined();
  });

  it("leaves an event without request or user as it was", () => {
    const event: ScrubbableEvent & { message: string; tags: Record<string, string> } = {
      message: "boom",
      tags: { service: "worker" },
    };
    expect(scrubErrorEvent(event)).toEqual({ message: "boom", tags: { service: "worker" } });
  });
});
