import { describe, expect, it } from "vitest";
import { OnboardingAnswersSchema } from "./api/me.js";
import {
  CreateFunnelSessionBodySchema,
  FunnelAnswersSchema,
  FunnelAttributionSchema,
  UpdateFunnelSessionBodySchema,
} from "./funnel.js";

const full = {
  goal: "presentations",
  situations: ["meetings", "calls"],
  language: "fluent",
  symptoms: ["too-fast"],
  "self-rating": 3,
  time: "10",
  deadline: "month",
  focus: "pace",
  "practice-now": "no",
  reminders: "yes",
};

describe("FunnelAnswersSchema", () => {
  it("accepts every answer the funnel offers", () => {
    expect(FunnelAnswersSchema.parse(full)).toEqual(full);
  });

  it("rejects values the funnel doesn't offer and unknown keys", () => {
    expect(FunnelAnswersSchema.safeParse({ goal: "world-domination" }).success).toBe(false);
    expect(FunnelAnswersSchema.safeParse({ "self-rating": 9 }).success).toBe(false);
    expect(FunnelAnswersSchema.safeParse({ email: "a@b.c" }).success).toBe(false);
  });

  it("produces answers that are also valid onboarding answers (copied on claim)", () => {
    expect(OnboardingAnswersSchema.safeParse(full).success).toBe(true);
  });

  it("validates the PATCH body's step id", () => {
    expect(
      UpdateFunnelSessionBodySchema.safeParse({ answers: {}, currentStep: "goal" }).success,
    ).toBe(true);
    expect(
      UpdateFunnelSessionBodySchema.safeParse({ answers: {}, currentStep: "../x" }).success,
    ).toBe(false);
  });
});

describe("CreateFunnelSessionBodySchema", () => {
  it("accepts {} and rejects unknown keys and over-long UTM values", () => {
    expect(CreateFunnelSessionBodySchema.safeParse({}).success).toBe(true);
    const body = {
      funnel: { slug: "main", version: 2 },
      attribution: { utmSource: "tiktok", utmCampaign: "spring", referrerHost: "www.google.com" },
    };
    expect(CreateFunnelSessionBodySchema.parse(body)).toEqual(body);

    expect(CreateFunnelSessionBodySchema.safeParse({ userId: "x" }).success).toBe(false);
    expect(
      CreateFunnelSessionBodySchema.safeParse({ funnel: { slug: "main", version: 1, x: 1 } })
        .success,
    ).toBe(false);
    expect(CreateFunnelSessionBodySchema.safeParse({ attribution: { gclid: "abc" } }).success).toBe(
      false,
    );
  });

  it("drops invalid attribution fields instead of rejecting the body", () => {
    // Attribution is visitor-controlled (the landing URL) and best-effort: a bad value must
    // never stop the guest session from being created.
    expect(
      CreateFunnelSessionBodySchema.parse({
        funnel: { slug: "main", version: 1 },
        attribution: {
          utmSource: "a".repeat(201),
          utmMedium: "\u0000cpc\u001F",
          utmCampaign: "\u0000",
          utmTerm: "a".repeat(200),
          referrerHost: "https://www.google.com/search?q=x",
        },
      }),
    ).toEqual({
      funnel: { slug: "main", version: 1 },
      attribution: { utmMedium: "cpc", utmTerm: "a".repeat(200) },
    });
  });

  it("rejects a bad funnel slug or version", () => {
    expect(
      CreateFunnelSessionBodySchema.safeParse({ funnel: { slug: "../x", version: 1 } }).success,
    ).toBe(false);
    expect(
      CreateFunnelSessionBodySchema.safeParse({ funnel: { slug: "main", version: 0 } }).success,
    ).toBe(false);
  });
});

describe("FunnelAttributionSchema", () => {
  it("trims values", () => {
    expect(FunnelAttributionSchema.parse({ utmMedium: "  cpc " })).toEqual({ utmMedium: "cpc" });
  });

  it("strips control characters (Postgres rejects NUL in text)", () => {
    expect(FunnelAttributionSchema.parse({ utmSource: "\u0000x\u007F " })).toEqual({
      utmSource: "x",
    });
    expect(FunnelAttributionSchema.safeParse({ utmSource: "\u0000\t" }).success).toBe(false);
  });

  it("referrerHost rejects a full URL", () => {
    const ok = (referrerHost: string) =>
      FunnelAttributionSchema.safeParse({ referrerHost }).success;
    expect(ok("google.com")).toBe(true);
    expect(ok("l.facebook.com")).toBe(true);
    expect(ok("localhost")).toBe(true);
    expect(ok("https://google.com/search?q=x")).toBe(false);
    expect(ok("google.com/path")).toBe(false);
    expect(ok("google.com:8080")).toBe(false);
    expect(ok("user@google.com")).toBe(false);
  });
});
