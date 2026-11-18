import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

const base = {
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  S3_BUCKET: "test-bucket",
  DEEPGRAM_API_KEY: "dg-test-key-123",
  ANTHROPIC_API_KEY: "sk-ant-test",
};

describe("worker parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env.WORKER_CONCURRENCY).toBe(2);
    expect(env.NODE_ENV).toBe("development");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(env.AWS_REGION).toBe("us-east-1");
    expect(env.FFMPEG_PATH).toBe("ffmpeg");
  });

  it("treats empty prices and endpoint as unset", () => {
    const env = parseEnv({
      ...base,
      PRICE_STT_USD_PER_MIN: "",
      S3_ENDPOINT: "",
      ANTHROPIC_MODEL: "",
      FFMPEG_PATH: "",
    });
    expect(env.PRICE_STT_USD_PER_MIN).toBe(0);
    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(env.FFMPEG_PATH).toBe("ffmpeg");
  });

  it("parses prices as numbers", () => {
    expect(
      parseEnv({ ...base, PRICE_LLM_INPUT_USD_PER_MTOK: "2.5" }).PRICE_LLM_INPUT_USD_PER_MTOK,
    ).toBe(2.5);
  });

  it("rejects a non-positive concurrency", () => {
    expect(() => parseEnv({ ...base, WORKER_CONCURRENCY: "0" })).toThrow();
  });

  it("requires the provider keys", () => {
    expect(() => parseEnv({ ...base, DEEPGRAM_API_KEY: "" })).toThrow(/DEEPGRAM_API_KEY/);
    expect(() => parseEnv({ ...base, ANTHROPIC_API_KEY: "nope" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("requires REDIS_URL", () => {
    expect(() => parseEnv({})).toThrow(/REDIS_URL/);
  });
});
