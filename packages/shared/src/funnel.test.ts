import { describe, expect, it } from "vitest";
import { OnboardingAnswersSchema } from "./api/me.js";
import { FunnelAnswersSchema, UpdateFunnelSessionBodySchema } from "./funnel.js";

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
