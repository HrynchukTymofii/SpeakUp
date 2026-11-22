import * as Sentry from "@sentry/nextjs";
import { errorTrackingEnvironment, sentryOptions } from "@/lib/error-tracking";

/** Server-side errors (rendering, route handlers, proxy) → Sentry; see lib/error-tracking.ts. */
export function register(): void {
  Sentry.init(
    sentryOptions(
      process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
      errorTrackingEnvironment(process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NODE_ENV),
    ),
  );
}

export const onRequestError = Sentry.captureRequestError;
