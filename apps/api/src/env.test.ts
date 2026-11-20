import { describe, expect, it } from "vitest";
import { parseEnv, TURNSTILE_TEST_SECRET } from "./env.js";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGINS: "http://localhost:3000, https://speakup.example",
  CLERK_SECRET_KEY: "sk_test_abc",
  S3_BUCKET: "speakup-recordings",
};

describe("parseEnv", () => {
  it("parses valid env and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000", "https://speakup.example"]);
    expect(env.FREE_DAILY_ANALYSES).toBe(3);
    expect(env.PRO_DAILY_ANALYSES).toBe(50);
    expect(env.AWS_REGION).toBe("us-east-1");
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it("funnel: dev defaults work locally, but production must set real secrets", () => {
    const dev = parseEnv(valid);
    expect(dev.TURNSTILE_SECRET_KEY).toBe(TURNSTILE_TEST_SECRET);
    expect(dev.FUNNEL_IP_DAILY_LIMIT).toBe(3);

    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(/TURNSTILE_SECRET_KEY/);
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: "production", TURNSTILE_SECRET_KEY: "0x4AAA-real" }),
    ).toThrow(/IP_HASH_SECRET/);
    expect(
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        TURNSTILE_SECRET_KEY: "0x4AAA-real",
        IP_HASH_SECRET: "a-long-random-production-secret",
        PADDLE_API_KEY: "pdl_live_apikey",
        PADDLE_WEBHOOK_SECRET: "pdl_ntfset_secret",
        PADDLE_PRICE_ID_PRO_MONTHLY: "pri_123",
      }).NODE_ENV,
    ).toBe("production");
  });

  it("billing is optional in dev but required in production", () => {
    expect(parseEnv(valid).PADDLE_API_KEY).toBeUndefined();
    expect(parseEnv(valid).PADDLE_ENV).toBe("sandbox");
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        TURNSTILE_SECRET_KEY: "0x4AAA-real",
        IP_HASH_SECRET: "a-long-random-production-secret",
      }),
    ).toThrow(/PADDLE_API_KEY/);
  });

  it("treats an empty S3_ENDPOINT (`S3_ENDPOINT=` in .env) as unset = real AWS", () => {
    expect(parseEnv({ ...valid, S3_ENDPOINT: "" }).S3_ENDPOINT).toBeUndefined();
    expect(parseEnv({ ...valid, S3_ENDPOINT: "http://localhost:4566" }).S3_ENDPOINT).toBe(
      "http://localhost:4566",
    );
  });

  it("requires S3_BUCKET", () => {
    expect(() => parseEnv({ ...valid, S3_BUCKET: "" })).toThrow(/S3_BUCKET/);
  });

  it("coerces numbers from strings", () => {
    expect(parseEnv({ ...valid, API_PORT: "8080" }).API_PORT).toBe(8080);
  });

  it("fails fast when a required var is missing", () => {
    const { REDIS_URL: _omit, ...withoutRedis } = valid;
    expect(() => parseEnv(withoutRedis)).toThrow(/REDIS_URL/);
  });

  it("rejects a malformed CORS origin", () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: "not-a-url" })).toThrow();
  });

  it("rejects a publishable key where the secret key belongs", () => {
    expect(() => parseEnv({ ...valid, CLERK_SECRET_KEY: "pk_test_abc" })).toThrow(
      /CLERK_SECRET_KEY/,
    );
  });

  it("DB_POOL_MAX is optional and must be positive", () => {
    expect(parseEnv(valid).DB_POOL_MAX).toBeUndefined();
    expect(parseEnv({ ...valid, DB_POOL_MAX: "8" }).DB_POOL_MAX).toBe(8);
    expect(() => parseEnv({ ...valid, DB_POOL_MAX: "0" })).toThrow(/DB_POOL_MAX/);
  });

  it("load-test auth: off by default, needs a long secret, and is refused in production", () => {
    const secret = "x".repeat(32);
    expect(parseEnv(valid).LOAD_TEST_AUTH_SECRET).toBeUndefined();
    expect(parseEnv({ ...valid, LOAD_TEST_AUTH_SECRET: secret }).LOAD_TEST_AUTH_SECRET).toBe(
      secret,
    );
    expect(() => parseEnv({ ...valid, LOAD_TEST_AUTH_SECRET: "short" })).toThrow(
      /LOAD_TEST_AUTH_SECRET/,
    );

    const prod = {
      ...valid,
      NODE_ENV: "production",
      TURNSTILE_SECRET_KEY: "0x4AAA-real",
      IP_HASH_SECRET: "a-long-random-production-secret",
      PADDLE_API_KEY: "pdl_live_apikey",
      PADDLE_WEBHOOK_SECRET: "pdl_ntfset_secret",
      PADDLE_PRICE_ID_PRO_MONTHLY: "pri_123",
      LOAD_TEST_AUTH_SECRET: secret,
    };
    // A second, independent switch: only the throwaway load-test stack sets it.
    expect(() => parseEnv(prod)).toThrow(/LOAD_TEST_AUTH_SECRET/);
    expect(parseEnv({ ...prod, LOAD_TEST_STACK: "true" }).LOAD_TEST_AUTH_SECRET).toBe(secret);
  });
});
