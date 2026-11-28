import { describe, expect, it } from "vitest";
import { DEFAULT_FUNNEL_DEFINITION } from "../funnel-default.js";
import { FunnelSlugSchema } from "../funnel.js";
import { FunnelResponseSchema, FunnelStatusSchema } from "./funnels.js";

describe("FunnelResponseSchema", () => {
  it("accepts a slug, a content revision and a valid definition", () => {
    const body = { funnel: { slug: "main", version: 3, definition: DEFAULT_FUNNEL_DEFINITION } };
    expect(FunnelResponseSchema.safeParse(body).success).toBe(true);
  });

  it("rejects an invalid definition", () => {
    const definition = { ...DEFAULT_FUNNEL_DEFINITION, steps: [] };
    expect(
      FunnelResponseSchema.safeParse({ funnel: { slug: "main", version: 1, definition } }).success,
    ).toBe(false);
  });

  it("rejects a version below 1 and a non-URL-safe slug", () => {
    const definition = DEFAULT_FUNNEL_DEFINITION;
    expect(
      FunnelResponseSchema.safeParse({ funnel: { slug: "main", version: 0, definition } }).success,
    ).toBe(false);
    expect(
      FunnelResponseSchema.safeParse({ funnel: { slug: "Main/x", version: 1, definition } })
        .success,
    ).toBe(false);
  });
});

describe("FunnelSlugSchema", () => {
  it("accepts URL-safe slugs up to 64 characters", () => {
    expect(FunnelSlugSchema.safeParse("spring-promo-2").success).toBe(true);
    expect(FunnelSlugSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(FunnelSlugSchema.safeParse("a".repeat(65)).success).toBe(false);
    expect(FunnelSlugSchema.safeParse("../etc").success).toBe(false);
    expect(FunnelSlugSchema.safeParse("").success).toBe(false);
  });
});

describe("FunnelStatusSchema", () => {
  it("knows draft and live only", () => {
    expect(FunnelStatusSchema.options).toEqual(["draft", "live"]);
  });
});
