import { describe, expect, it } from "vitest";
import { UpdateOnboardingBodySchema } from "./me.js";

describe("UpdateOnboardingBodySchema", () => {
  it("accepts the answer shapes the funnel uses", () => {
    const body = {
      answers: {
        goal: "job-interviews",
        situations: ["meetings", "calls"],
        "self-rating": 3,
        "practices-aloud": false,
      },
    };
    expect(UpdateOnboardingBodySchema.parse(body)).toEqual(body);
  });

  it("rejects unknown top-level fields", () => {
    expect(() =>
      UpdateOnboardingBodySchema.parse({ answers: {}, userId: "someone-else" }),
    ).toThrow();
  });

  it("rejects malformed question ids", () => {
    expect(() => UpdateOnboardingBodySchema.parse({ answers: { "Bad Key!": "x" } })).toThrow();
  });

  it("rejects oversized values", () => {
    expect(() =>
      UpdateOnboardingBodySchema.parse({ answers: { goal: "x".repeat(501) } }),
    ).toThrow();
  });

  it("rejects too many answers", () => {
    const answers = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`q${i}`, "a"]));
    expect(() => UpdateOnboardingBodySchema.parse({ answers })).toThrow();
  });
});
