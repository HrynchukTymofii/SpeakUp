import { describe, expect, it } from "vitest";
import { FUNNEL_STEPS } from "./config";
import {
  furthestAllowedIndex,
  matchesRule,
  progressOf,
  visibleSteps,
  type EngineState,
} from "./engine";
import { funnelExerciseKey } from "./query-keys";
import {
  buildPlan,
  focusOptions,
  goalReflection,
  OPTIONS_PROVIDERS,
  PERSONALIZERS,
  renderText,
  symptomReflection,
} from "./personalize";
import type { FunnelContext } from "./types";

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

  it("step ids are exactly the current funnel, in order", () => {
    // Ids are URLs (/start/<id>) and analytics step names: moving the definition must keep them.
    expect(FUNNEL_STEPS.map((s) => s.id)).toEqual([
      "goal",
      "situations",
      "reflection-1",
      "language",
      "symptoms",
      "reflection-2",
      "self-rating",
      "time",
      "mini-lesson",
      "mic",
      "exercise",
      "auth",
      "results",
      "deadline",
      "focus",
      "plan-loader",
      "plan",
      "paywall",
    ]);
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
    expect(goalReflection({ goal: "pitching" }).title).toMatch(/pitch/);
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

describe("funnelExerciseKey", () => {
  it("depends on the goal, so changing the goal fetches the matching speaking check", () => {
    // The server picks the check (and records the attempt) by goal; a cached question from
    // another goal would show one question but record against another.
    expect(funnelExerciseKey("pitching")).not.toEqual(funnelExerciseKey("job-interviews"));
    expect(funnelExerciseKey(undefined)).toEqual(funnelExerciseKey(undefined));
  });
});

describe("matchesRule", () => {
  const ctx = (answers: FunnelContext["answers"]): FunnelContext => ({ answers, topIssues: [] });
  const pitching = ctx({ goal: "pitching", symptoms: ["fillers", "quiet"], "self-rating": 2 });

  it("no rule means visible", () => {
    expect(matchesRule(undefined, ctx({}))).toBe(true);
  });

  it("equals / notEquals / in compare a single answer", () => {
    expect(matchesRule({ answer: "goal", op: "equals", value: "pitching" }, pitching)).toBe(true);
    expect(matchesRule({ answer: "goal", op: "equals", value: "meetings" }, pitching)).toBe(false);
    expect(matchesRule({ answer: "self-rating", op: "equals", value: 2 }, pitching)).toBe(true);
    expect(matchesRule({ answer: "goal", op: "notEquals", value: "meetings" }, pitching)).toBe(
      true,
    );
    expect(matchesRule({ answer: "goal", op: "notEquals", value: "pitching" }, pitching)).toBe(
      false,
    );
    // Unanswered is "not equal" to anything.
    expect(matchesRule({ answer: "time", op: "notEquals", value: "5" }, pitching)).toBe(true);
    expect(
      matchesRule({ answer: "goal", op: "in", values: ["meetings", "pitching"] }, pitching),
    ).toBe(true);
    expect(matchesRule({ answer: "goal", op: "in", values: ["meetings"] }, pitching)).toBe(false);
    expect(matchesRule({ answer: "time", op: "in", values: ["5"] }, pitching)).toBe(false);
  });

  it("includes checks a multi answer", () => {
    expect(matchesRule({ answer: "symptoms", op: "includes", value: "quiet" }, pitching)).toBe(
      true,
    );
    expect(matchesRule({ answer: "symptoms", op: "includes", value: "repeat" }, pitching)).toBe(
      false,
    );
    expect(matchesRule({ answer: "situations", op: "includes", value: "calls" }, pitching)).toBe(
      false,
    );
  });

  it("answered / notAnswered", () => {
    expect(matchesRule({ answer: "goal", op: "answered" }, pitching)).toBe(true);
    expect(matchesRule({ answer: "time", op: "answered" }, pitching)).toBe(false);
    expect(matchesRule({ answer: "time", op: "notAnswered" }, pitching)).toBe(true);
    // An emptied multi answer counts as not answered.
    expect(matchesRule({ answer: "situations", op: "answered" }, ctx({ situations: [] }))).toBe(
      false,
    );
  });

  it("all / any / not combine rules", () => {
    const isPitching = { answer: "goal", op: "equals", value: "pitching" } as const;
    const hasTime = { answer: "time", op: "answered" } as const;
    expect(matchesRule({ all: [isPitching, hasTime] }, pitching)).toBe(false);
    expect(matchesRule({ all: [isPitching, { not: hasTime }] }, pitching)).toBe(true);
    expect(matchesRule({ any: [hasTime, isPitching] }, pitching)).toBe(true);
    expect(matchesRule({ any: [hasTime, { not: isPitching }] }, pitching)).toBe(false);
    expect(matchesRule({ not: isPitching }, pitching)).toBe(false);
  });
});

describe("renderText", () => {
  it("returns text without placeholders unchanged", () => {
    const text = "Speaking with confidence is a skill.";
    expect(renderText(text, { goal: "pitching" })).toBe(text);
  });

  it("inserts the selected option's label", () => {
    expect(renderText("Goal: {{answer:goal}}.", { goal: "meetings" })).toBe(
      "Goal: Meetings & calls at work.",
    );
    expect(renderText("You said {{answer:self-rating}}/5", { "self-rating": 3 })).toBe(
      "You said 3/5",
    );
    expect(renderText("{{answer:reminders}}", { reminders: "yes" })).toBe("Yes");
  });

  it("joins the labels of a multi answer", () => {
    expect(renderText("{{answer:situations}}", { situations: ["meetings", "calls"] })).toBe(
      "In meetings, On calls / video",
    );
  });

  it("uses the fallback when unanswered, or nothing without one", () => {
    expect(renderText("For {{answer:goal|your goal}}.", {})).toBe("For your goal.");
    expect(renderText("For {{answer:goal}}.", {})).toBe("For .");
    expect(renderText("{{answer:situations|anywhere}}", { situations: [] })).toBe("anywhere");
  });
});

describe("registries", () => {
  it("PERSONALIZERS match the reflection functions", () => {
    const ctx: FunnelContext = {
      answers: { goal: "pitching", symptoms: ["quiet"] },
      topIssues: [],
    };
    expect(PERSONALIZERS.goalReflection(ctx)).toEqual(goalReflection(ctx.answers));
    expect(PERSONALIZERS.symptomReflection(ctx)).toEqual(symptomReflection(ctx.answers));
  });

  it("OPTIONS_PROVIDERS.focusFromTopIssues = focusOptions(topIssues)", () => {
    const ctx: FunnelContext = { answers: {}, topIssues: ["pauses", "voice"] };
    expect(OPTIONS_PROVIDERS.focusFromTopIssues(ctx)).toEqual(focusOptions(ctx.topIssues));
  });
});
