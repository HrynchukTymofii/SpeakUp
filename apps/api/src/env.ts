import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** "http://a.com,http://b.com" → ["http://a.com", "http://b.com"] */
const commaSeparatedUrls = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

/** `.env` files write unset values as `KEY=` — treat that empty string as "not set". */
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalUrl = z.preprocess(emptyAsUndefined, z.url().optional());

/** Cloudflare's documented Turnstile test secret: every token passes. Dev/test only. */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const DEV_IP_HASH_SECRET = "dev-only-ip-hash-secret-change-me";

/**
 * Env is validated once at boot. If anything is missing or malformed the process exits
 * immediately with a readable error, instead of failing later on the first request (SPEC §9).
 *
 * Only variables the API uses *today* are listed; each milestone adds its own.
 * The full list lives in .env.example.
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url(),
    // Max Postgres connections this process opens (node-postgres default: 10). Size it so
    // (API tasks × pool) + (worker tasks × pool) stays under the DB's max_connections.
    DB_POOL_MAX: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).optional()),
    REDIS_URL: z.url(),
    // Sentry project DSN for error reports. Unset = error tracking off.
    SENTRY_DSN: z.preprocess(emptyAsUndefined, z.url().optional()),
    CORS_ORIGINS: commaSeparatedUrls,
    // Clerk secret key — verifies session JWTs and reads user emails. Never sent to the browser.
    CLERK_SECRET_KEY: z.string().startsWith("sk_", "must be a Clerk secret key (sk_...)"),
    // S3 bucket for recordings (private). AWS credentials are NOT listed here on purpose:
    // the AWS SDK finds them itself (env vars locally, the ECS task's IAM role in prod).
    AWS_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(3, "S3_BUCKET is required (see .env.example)"),
    // Local dev only: an S3-compatible emulator (LocalStack). Unset in prod = real AWS S3.
    S3_ENDPOINT: optionalUrl,
    FREE_DAILY_ANALYSES: z.coerce.number().int().min(0).default(3),
    // (M7) Rate limits: requests per minute per IP (all routes), new recordings per minute per user.
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
    ATTEMPTS_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    // (M8) How many proxies sit in front of the API in production (ALB = 1). request.ip is
    // taken that many hops from the right of X-Forwarded-For; the left part is client-written
    // and spoofable. Ignored outside production (no proxy locally).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    PRO_DAILY_ANALYSES: z.coerce.number().int().min(0).default(50),

    // (M5.5) Anonymous funnel. Defaults are DEV-ONLY values; production must set real ones
    // (enforced below), otherwise the bot check would always pass and IP hashes be guessable.
    TURNSTILE_SECRET_KEY: z.preprocess(emptyAsUndefined, z.string().default(TURNSTILE_TEST_SECRET)),
    FUNNEL_IP_DAILY_LIMIT: z.coerce.number().int().min(1).default(3),

    // (M6) Paddle Billing. Optional in dev (billing routes answer 503 NOT_CONFIGURED without
    // them), required in production (checked below).
    PADDLE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    PADDLE_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
    PADDLE_WEBHOOK_SECRET: z.preprocess(emptyAsUndefined, z.string().optional()),
    PADDLE_PRICE_ID_PRO_MONTHLY: z.preprocess(
      emptyAsUndefined,
      z.string().startsWith("pri_").optional(),
    ),
    IP_HASH_SECRET: z.preprocess(emptyAsUndefined, z.string().min(16).default(DEV_IP_HASH_SECRET)),

    // Load testing only (docs/load-testing.md): also accept HMAC-signed tokens for
    // `loadtest_*` users, so k6 can sign in thousands of users without Clerk.
    LOAD_TEST_AUTH_SECRET: z.preprocess(emptyAsUndefined, z.string().min(32).optional()),
    // Set only by the throwaway load-test CDK stack; production refuses the secret without it.
    LOAD_TEST_STACK: z.preprocess(emptyAsUndefined, z.enum(["true", "false"]).default("false")),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.LOAD_TEST_AUTH_SECRET && env.LOAD_TEST_STACK !== "true") {
      ctx.addIssue({
        code: "custom",
        path: ["LOAD_TEST_AUTH_SECRET"],
        message: "load-test auth is not allowed in production (only with LOAD_TEST_STACK=true)",
      });
    }
    if (env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "set the real secret in production",
      });
    }
    for (const key of [
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_PRICE_ID_PRO_MONTHLY",
    ] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: "required in production" });
    }
    if (env.IP_HASH_SECRET === DEV_IP_HASH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["IP_HASH_SECRET"],
        message: "set a random secret in production",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Pure parse function — easy to unit-test without touching process.env. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * In dev every app reads the single repo-root `.env`. In production there is no file:
 * variables come from the container (ECS task definition / Secrets Manager).
 * Node's built-in loader never overrides variables that are already set.
 */
export function loadRootDotEnv(): void {
  const path = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
