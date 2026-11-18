import { describe, expect, it } from "vitest";
import { FUNNEL_STEPS } from "./config";
import { furthestAllowedIndex, progressOf, visibleSteps, type EngineState } from "./engine";
import { buildPlan, focusOptions, goalReflection, symptomReflection } from "./personalize";

const empty: EngineState = {
  answers: {},
  topIssues: [],
  completed: [],
  attemptId: null,
  claimed: false,
};
const indexOf = (id: string) => FUNNEL_STEPS.findIndex((s) => s.id === id);
const step = (id: string) => {
  const found = FUNNEL_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
};

describe("funnel config", () => {
  it("has unique, URL-safe step ids and the SPEC's 18 steps", () => {
    const ids = FUNNEL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
    expect(ids).toHaveLength(18);
    expect(ids[0]).toBe("goal");
    expect(ids.at(-1)).toBe("paywall");
  });
});

describe("furthestAllowedIndex (guards)", () => {
  it("a new visitor can only open the first step", () => {
    expect(furthestAllowedIndex(FUNNEL_STEPS, empty)).toBe(0);
  });

  it("moves forward as answers and completed steps accumulate", () => {
    const state = {
      ...empty,
      answers: { goal: "presentations" as const, situations: ["meetings" as const] },
    };
    expect(FUNNEL_STEPS[furthestAllowedIndex(FUNNEL_STEPS, state)]?.id).toBe("reflection-1");
  });

  it("results need a claimed attempt: recorded but not signed up stops at auth", () => {
    const beforeExercise = FUNNEL_STEPS.slice(0, indexOf("exercise")).map((s) => s.id);
    const state: EngineState = {
      ...empty,
      answers: {
        goal: "presentations",
        situations: ["meetings"],
        language: "fluent",
        symptoms: ["fillers"],
        "self-rating": 3,
        time: "10",
      },
      completed: [...beforeExercise, "exercise"],
      attemptId: "att_1",
    };
    expect(FUNNEL_STEPS[furthestAllowedIndex(FUNNEL_STEPS, state)]?.id).toBe("auth");
    expect(FUNNEL_STEPS[furthestAllowedIndex(FUNNEL_STEPS, { ...state, claimed: true })]?.id).toBe(
      "results",
    );
  });

  it("an empty multi-choice answer doesn't count as answered", () => {
    const state = { ...empty, answers: { goal: "meetings" as const, situations: [] } };
    expect(FUNNEL_STEPS[furthestAllowedIndex(FUNNEL_STEPS, state)]?.id).toBe("situations");
  });
});

describe("progressOf", () => {
  it("grows step by step and is full on the paywall", () => {
    const first = progressOf(FUNNEL_STEPS, step("goal"));
    const later = progressOf(FUNNEL_STEPS, step("exercise"));
    expect(first).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(first);
    expect(progressOf(FUNNEL_STEPS, step("paywall"))).toBe(1);
  });
});

describe("visibleSteps", () => {
  it("keeps steps without a condition", () => {
    expect(visibleSteps(FUNNEL_STEPS, empty)).toHaveLength(FUNNEL_STEPS.length);
  });
});

describe("personalize", () => {
  it("reflection 1 follows the goal, with a fallback", () => {
    expect(goalReflection({ goal: "job-interviews" }).title).toMatch(/Interviews reward/);
    expect(goalReflection({}).title).toMatch(/skill/);
  });

  it("reflection 2 follows the FIRST selected symptom", () => {
    expect(symptomReflection({ symptoms: ["too-fast", "fillers"] }).title).toMatch(/Speeding up/);
    expect(symptomReflection({ symptoms: ["fillers"] }).title).toMatch(/Filler words/);
    expect(symptomReflection({}).title).toMatch(/Nerves/);
  });

  it("focus options = top 2 issues from the result + overall confidence", () => {
    expect(focusOptions(["fillers", "pace", "pauses"]).map((o) => o.value)).toEqual([
      "fillers",
      "pace",
      "confidence",
    ]);
    expect(focusOptions(["unknown-category"]).map((o) => o.value)).toEqual([
      "pace",
      "fillers",
      "confidence",
    ]);
  });

  it("builds a 4-week plan from goal, focus and time — without promised outcomes", () => {
    const plan = buildPlan({ goal: "job-interviews", focus: "fillers", time: "15" });
    expect(plan.headline).toBe("Your 4-week plan for job interviews");
    expect(plan.minutesPerDay).toBe("15");
    expect(plan.weeks).toHaveLength(4);
    expect(plan.weeks[0]?.title).toMatch(/filler words/);
    expect(JSON.stringify(plan)).not.toMatch(/\d+ ?%/); // no invented statistics
    expect(buildPlan({}).headline).toBe("Your 4-week speaking plan");
  });
});
