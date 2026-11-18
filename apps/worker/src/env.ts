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
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.url(),
  DATABASE_URL: z.url(),
  // Jobs mostly wait on network I/O (STT, LLM), so a few in parallel per process is cheap.
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(2),

  AWS_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(3),
  S3_ENDPOINT: z.preprocess(emptyAsUndefined, z.url().optional()),

  // Audio decoding for pitch/loudness/pause analysis. The Docker image ships ffmpeg on PATH.
  FFMPEG_PATH: z.preprocess(emptyAsUndefined, z.string().min(1).default("ffmpeg")),

  DEEPGRAM_API_KEY: z.string().min(10, "DEEPGRAM_API_KEY is required (see .env.example)"),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "must be an Anthropic API key (sk-ant-...)"),
  ANTHROPIC_MODEL: z.preprocess(emptyAsUndefined, z.string().default("claude-sonnet-5-5")),

  PRICE_STT_USD_PER_MIN: price,
  PRICE_LLM_INPUT_USD_PER_MTOK: price,
  PRICE_LLM_OUTPUT_USD_PER_MTOK: price,
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
