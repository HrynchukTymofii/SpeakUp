import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** `.env` files write unset values as `KEY=` — treat that empty string as "not set". */
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

/** A non-negative price; empty = 0 (cost estimates then just under-report). */
const price = z.preprocess(emptyAsUndefined, z.coerce.number().min(0).default(0));

/**
 * Worker config, validated at boot (exit on invalid). Same pattern as apps/api/src/env.ts.
 * AWS credentials are not listed: the AWS SDK finds them itself (env locally, IAM role in prod).
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    REDIS_URL: z.url(),
    DATABASE_URL: z.url(),
    // Sentry project DSN for error reports. Unset = error tracking off.
    SENTRY_DSN: z.preprocess(emptyAsUndefined, z.url().optional()),
    // Max Postgres connections this process opens (node-postgres default: 10). Size it so
    // (API tasks × pool) + (worker tasks × pool) stays under the DB's max_connections.
    DB_POOL_MAX: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).optional()),
    // CloudWatch namespace for queue-depth metrics (worker autoscaling, docs/scaling.md).
    // Unset = don't publish (local dev).
    QUEUE_METRICS_NAMESPACE: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
    // Jobs mostly wait on network I/O (STT, LLM), so a few in parallel per process is cheap.
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(2),

    AWS_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(3),
    S3_ENDPOINT: z.preprocess(emptyAsUndefined, z.url().optional()),

    // Audio decoding for pitch/loudness/pause analysis. The Docker image ships ffmpeg on PATH.
    FFMPEG_PATH: z.preprocess(emptyAsUndefined, z.string().min(1).default("ffmpeg")),

    // "fake" = simulated Deepgram/Claude for load tests (docs/load-testing.md): no network calls,
    // no provider cost, results marked with llmModel "fake-llm". Never set it in production.
    ANALYSIS_PROVIDERS: z.enum(["real", "fake"]).default("real"),
    FAKE_STT_MEDIAN_MS: z.coerce.number().int().min(0).default(1000),
    FAKE_LLM_MEDIAN_MS: z.coerce.number().int().min(0).default(2000),
    FAKE_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),

    // Required only with the real providers (checked below).
    DEEPGRAM_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
    ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
    ANTHROPIC_MODEL: z.preprocess(emptyAsUndefined, z.string().default("claude-sonnet-5-5")),

    PRICE_STT_USD_PER_MIN: price,
    PRICE_LLM_INPUT_USD_PER_MTOK: price,
    PRICE_LLM_OUTPUT_USD_PER_MTOK: price,
  })
  .superRefine((env, ctx) => {
    if (env.ANALYSIS_PROVIDERS === "fake") return;
    if ((env.DEEPGRAM_API_KEY ?? "").length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["DEEPGRAM_API_KEY"],
        message: "DEEPGRAM_API_KEY is required (see .env.example)",
      });
    }
    if (!env.ANTHROPIC_API_KEY?.startsWith("sk-ant-")) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "must be an Anthropic API key (sk-ant-...)",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Dev only: load the repo-root `.env`. In prod, variables come from the container. */
export function loadRootDotEnv(): void {
  const path = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
