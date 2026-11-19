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

  it("uses the real providers unless fake ones are asked for", () => {
    expect(parseEnv(base).ANALYSIS_PROVIDERS).toBe("real");
  });

  it("fake providers need no API keys and have latency defaults", () => {
    const env = parseEnv({
      ...base,
      DEEPGRAM_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      ANALYSIS_PROVIDERS: "fake",
    });
    expect(env.ANALYSIS_PROVIDERS).toBe("fake");
    expect(env.FAKE_STT_MEDIAN_MS).toBe(1000);
    expect(env.FAKE_LLM_MEDIAN_MS).toBe(2000);
    expect(env.FAKE_FAILURE_RATE).toBe(0);
  });

  it("rejects a failure rate outside 0–1", () => {
    expect(() =>
      parseEnv({ ...base, ANALYSIS_PROVIDERS: "fake", FAKE_FAILURE_RATE: "1.5" }),
    ).toThrow(/FAKE_FAILURE_RATE/);
  });

  it("requires REDIS_URL", () => {
    expect(() => parseEnv({})).toThrow(/REDIS_URL/);
  });
});
