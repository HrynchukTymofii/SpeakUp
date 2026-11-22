import type { init } from "@sentry/nextjs";
import { scrubErrorEvent } from "@speakup/shared";

type SentryOptions = NonNullable<Parameters<typeof init>[0]>;

/** "preview" vs "production" on Vercel (NEXT_PUBLIC_VERCEL_ENV), NODE_ENV elsewhere. */
export function errorTrackingEnvironment(vercelEnv: string | undefined, nodeEnv: string): string {
  return vercelEnv || nodeEnv;
}

/**
 * One Sentry setup for the browser (instrumentation-client.ts) and the Next server
 * (instrumentation.ts). Errors only: no tracing and no session replay, so nothing records what
 * users type or say, and usage stays inside the free plan. Every event is scrubbed (SPEC §9);
 * breadcrumbs are dropped because fetch URLs can carry signed queries.
 * No DSN → the SDK stays off (local dev, tests).
 */
export function sentryOptions(dsn: string | undefined, environment: string): SentryOptions {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent", "content-type"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubErrorEvent(event),
  };
}
