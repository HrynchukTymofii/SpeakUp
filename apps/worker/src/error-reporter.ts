import * as Sentry from "@sentry/node";
import { AnalysisErrorCode, scrubErrorEvent } from "@speakup/shared";
import { PipelineError } from "./errors.js";

/**
 * Sends unexpected failures to an error tracker (Sentry): grouped by cause, with stack traces,
 * which the CloudWatch error-count alarms can't show. Logs stay the full record.
 * Same setup as apps/api/src/services/error-reporter.ts (the apps share no Node-only package).
 */
export interface ErrorReporter {
  capture(err: unknown, tags: Record<string, string>): void;
  /** Sends what's queued; call before the process exits. */
  flush(timeoutMs: number): Promise<void>;
}

/**
 * No DSN → nothing is sent. Only explicit `capture` calls report: automatic instrumentation and
 * breadcrumbs are off, so pre-signed S3 links and provider calls never reach Sentry, and every
 * event is scrubbed (SPEC §9). Errors only, no tracing.
 */
export function createErrorReporter(opts: {
  dsn: string | undefined;
  environment: string;
  service: "api" | "worker";
}): ErrorReporter {
  if (!opts.dsn) return { capture: () => {}, flush: async () => {} };
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

/**
 * One report per recording that ends without feedback: on the last try, or at once for a
 * failure that won't be retried. Retries in between are noise (BullMQ may still succeed), and
 * NO_SPEECH is the user's silence, not our bug.
 */
export function shouldReportJobFailure(err: unknown, isFinalAttempt: boolean): boolean {
  if (err instanceof PipelineError) {
    if (err.code === AnalysisErrorCode.NO_SPEECH) return false;
    return isFinalAttempt || !err.retryable;
  }
  return isFinalAttempt;
}
