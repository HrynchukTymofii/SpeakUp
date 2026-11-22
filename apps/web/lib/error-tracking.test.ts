import { describe, expect, it } from "vitest";
import { errorTrackingEnvironment, sentryOptions } from "./error-tracking";

describe("sentryOptions (web error tracking)", () => {
  it("is off without a DSN", () => {
    expect(sentryOptions(undefined, "production").enabled).toBe(false);
  });

  it("sends errors only: no tracing, no session replay", () => {
    const options = sentryOptions("https://k@o1.ingest.sentry.io/1", "production");
    expect(options.enabled).toBe(true);
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
  });

  it("collects no user info, cookies, bodies or query strings", () => {
    expect(sentryOptions("https://k@o1.ingest.sentry.io/1", "production").dataCollection).toEqual(
      expect.objectContaining({
        userInfo: false,
        cookies: false,
        httpBodies: [],
        urlQueryParams: false,
      }),
    );
  });

  it("scrubs every event before it leaves (tokens, query strings, breadcrumbs)", () => {
    const { beforeSend } = sentryOptions("https://k@o1.ingest.sentry.io/1", "production");
    const event = beforeSend?.(
      {
        type: undefined,
        request: { url: "https://app.speakup.test/practice?guest=tok", headers: { cookie: "x" } },
        breadcrumbs: [{ message: "fetch https://s3/?X-Amz-Signature=x" }],
      },
      {},
    );
    expect(event).toEqual({
      type: undefined,
      request: { url: "https://app.speakup.test/practice", headers: {} },
    });
  });
});

describe("errorTrackingEnvironment", () => {
  it("tells Vercel previews apart from production", () => {
    expect(errorTrackingEnvironment("preview", "production")).toBe("preview");
    expect(errorTrackingEnvironment("production", "production")).toBe("production");
  });

  it("falls back to NODE_ENV off Vercel", () => {
    expect(errorTrackingEnvironment(undefined, "development")).toBe("development");
  });
});
