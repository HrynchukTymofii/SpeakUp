import { z } from "zod";

/**
 * Public (browser-visible) config. Next replaces `process.env.NEXT_PUBLIC_X` with the literal
 * value at build time, which only works for *direct* property access — so each var is listed
 * explicitly below rather than passing `process.env` as a whole.
 * Never put secrets here: anything NEXT_PUBLIC_ ships to every visitor.
 */
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

/** Cloudflare's documented Turnstile test site key: always passes. Dev only (pairs with the test secret). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  // (M5.5) Bot check on the anonymous funnel recording.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.preprocess(
    emptyAsUndefined,
    z.string().default(TURNSTILE_TEST_SITE_KEY),
  ),
  // (M5.5) The funnel's mini-lesson video: a full URL (the public S3 media bucket, CDK stack
  // output `MediaBaseUrl` + file name) or a path under apps/web/public. Videos are not bundled.
  // Empty → the step shows a "Video coming soon" placeholder instead of a broken player.
  NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL: z.preprocess(
    emptyAsUndefined,
    z.union([z.url(), z.string().regex(/^\/[^/]/)]).optional(),
  ),
  // (M6) Paddle.js client-side token (public by design) + environment. Empty token = checkout hidden.
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  NEXT_PUBLIC_PADDLE_ENV: z.preprocess(
    emptyAsUndefined,
    z.enum(["sandbox", "production"]).default("sandbox"),
  ),
});

export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL: process.env.NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
  NEXT_PUBLIC_PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV,
});
