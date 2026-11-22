import * as Sentry from "@sentry/nextjs";
import { publicEnv } from "@/lib/env";
import { errorTrackingEnvironment, sentryOptions } from "@/lib/error-tracking";

// Browser errors → Sentry (errors only; see lib/error-tracking.ts). Runs before the app is
// interactive. Off when NEXT_PUBLIC_SENTRY_DSN is empty.
Sentry.init(
  sentryOptions(
    publicEnv.NEXT_PUBLIC_SENTRY_DSN,
    errorTrackingEnvironment(process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NODE_ENV),
  ),
);
