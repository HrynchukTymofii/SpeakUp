import * as Sentry from "@sentry/node";
import { scrubErrorEvent } from "@speakup/shared";

/**
 * Sends unexpected errors to an error tracker (Sentry): grouped by cause, with stack traces,
 * which the CloudWatch error-count alarms can't show. Logs stay the full record.
 */
export interface ErrorReporter {
  capture(err: unknown, tags: Record<string, string>): void;
  /** Sends what's queued; call before the process exits. */
  flush(timeoutMs: number): Promise<void>;
}

export const noopErrorReporter: ErrorReporter = {
  capture: () => {},
  flush: async () => {},
};

/**
 * No DSN → nothing is sent (local dev, tests, a stack without Sentry). Only explicit `capture`
 * calls report: automatic instrumentation and breadcrumbs are off, so outgoing request URLs
 * (pre-signed S3 links, provider calls) never reach Sentry, and every event is scrubbed (SPEC §9).
 * No tracing either: errors only, well inside the free plan.
 */
export function createErrorReporter(opts: {
  dsn: string | undefined;
  environment: string;
  service: "api" | "worker";
}): ErrorReporter {
  if (!opts.dsn) return noopErrorReporter;
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    // Uncaught errors too go through `capture` (index.ts reports, flushes, then exits).
    defaultIntegrations: false,
    integrations: [Sentry.linkedErrorsIntegration()],
    // Collect no user info, cookies, bodies or query strings; scrubErrorEvent double-checks.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent", "content-type"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    initialScope: { tags: { service: opts.service } },
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubErrorEvent(event),
  });
  return {
    capture: (err, tags) => {
      Sentry.captureException(err, { tags });
    },
    flush: async (timeoutMs) => {
      await Sentry.flush(timeoutMs);
    },
  };
}
