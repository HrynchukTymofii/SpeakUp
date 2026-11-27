import { describe, expect, it } from "vitest";
import {
  FunnelDefinitionSchema,
  FunnelRuleSchema,
  TemplateTextSchema,
  type FunnelDefinition,
} from "./funnel-definition.js";

/** One step of every type, shaped like today's web config (apps/web/funnel/config.ts). */
const everyStepType = (): FunnelDefinition => ({
  version: 1,
  steps: [
    {
      id: "goal",
      type: "single_choice",
      answerKey: "goal",
      title: "What do you most want to improve?",
      options: [
        { value: "pitching", label: "Pitching" },
        { value: "meetings", label: "Meetings" },
      ],
    },
    {
      id: "situations",
      type: "multi_choice",
      answerKey: "situations",
      title: "When do you feel least confident speaking?",
      subtitle: "Choose all that apply.",
      options: [{ value: "calls", label: "On calls" }],
      showIf: { answer: "goal", op: "equals", value: "meetings" },
    },
    { id: "reflection-1", type: "reflection", content: { personalizer: "goalReflection" } },
    {
      id: "reflection-custom",
      type: "reflection",
      content: { title: "Nice, {{answer:goal|let’s go}}!", body: "Plain body." },
    },
    {
      id: "self-rating",
      type: "slider",
      answerKey: "self-rating",
      title: "How would you rate your speaking confidence today?",
      lowLabel: "Not confident",
      highLabel: "Very confident",
    },
    {
      id: "mini-lesson",
      type: "video_lesson",
      title: "How we’ll measure your speaking",
      takeaways: ["Pace and pauses"],
      unlockAfterSec: 10,
    },
    { id: "mic", type: "mic_permission" },
    { id: "exercise", type: "recording" },
    { id: "auth", type: "auth_gate" },
    { id: "results", type: "results" },
    {
      id: "focus",
      type: "single_choice",
      answerKey: "focus",
      title: "What should we work on first?",
      options: { provider: "focusFromTopIssues" },
    },
    {
      id: "plan-loader",
      type: "loader_with_questions",
      title: "Building your personal plan",
      checklist: ["Analyzing your recording"],
      durationMs: 12_000,
      questions: [
        { atPct: 30, answerKey: "practice-now", title: "Do you practice out loud now?" },
        { atPct: 65, answerKey: "reminders", title: "Would reminders help?" },
      ],
    },
    {
      id: "plan",
      type: "plan_summary",
      showIf: {
        all: [
          { answer: "self-rating", op: "in", values: [1, 2] },
          { not: { answer: "symptoms", op: "includes", value: "fillers" } },
          {
            any: [
              { answer: "reminders", op: "answered" },
              { answer: "time", op: "notAnswered" },
            ],
          },
        ],
      },
    },
    { id: "paywall", type: "paywall" },
  ],
});

const withStep = (step: unknown) => ({ version: 1, steps: [step] });
const ok = (value: unknown) => FunnelDefinitionSchema.safeParse(value).success;

describe("FunnelDefinitionSchema", () => {
  it("accepts a definition with every step type", () => {
    const def = everyStepType();
    const parsed = FunnelDefinitionSchema.parse(def);
    expect(parsed).toEqual(def);
    expect(new Set(parsed.steps.map((s) => s.type)).size).toBe(12);
  });

  it("rejects a version other than 1 and an empty step list", () => {
    expect(ok({ ...everyStepType(), version: 2 })).toBe(false);
    expect(ok({ version: 1, steps: [] })).toBe(false);
  });

  it("rejects unknown step types and unknown keys", () => {
    expect(ok(withStep({ id: "x", type: "carousel" }))).toBe(false);
    expect(ok(withStep({ id: "x", type: "paywall", price: 10 }))).toBe(false);
    expect(ok({ ...everyStepType(), extra: true })).toBe(false);
  });

  it("rejects duplicate and non-URL-safe step ids", () => {
    expect(ok(withStep({ id: "../x", type: "paywall" }))).toBe(false);
    expect(ok(withStep({ id: "Goal", type: "paywall" }))).toBe(false);
    expect(
      ok({
        version: 1,
        steps: [
          { id: "x", type: "paywall" },
          { id: "x", type: "results" },
        ],
      }),
    ).toBe(false);
  });

  it("rejects unknown personalizers and options providers", () => {
    expect(ok(withStep({ id: "r", type: "reflection", content: { personalizer: "eval" } }))).toBe(
      false,
    );
    expect(
      ok(
        withStep({
          id: "focus",
          type: "single_choice",
          answerKey: "focus",
          title: "t",
          options: { provider: "fetchFromUrl" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects option values the key doesn't allow, and repeated values", () => {
    const single = (options: unknown) =>
      withStep({ id: "goal", type: "single_choice", answerKey: "goal", title: "t", options });
    expect(ok(single([{ value: "world-domination", label: "World domination" }]))).toBe(false);
    expect(
      ok(
        single([
          { value: "pitching", label: "A" },
          { value: "pitching", label: "B" },
        ]),
      ),
    ).toBe(false);
    expect(
      ok(
        withStep({
          id: "s",
          type: "multi_choice",
          answerKey: "symptoms",
          title: "t",
          options: [{ value: "meetings", label: "In meetings" }], // a situations value
        }),
      ),
    ).toBe(false);
  });

  it("rejects the focusFromTopIssues provider on a key other than focus", () => {
    expect(
      ok(
        withStep({
          id: "goal",
          type: "single_choice",
          answerKey: "goal",
          title: "t",
          options: { provider: "focusFromTopIssues" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects an answer key collected by two steps or loader questions", () => {
    const def = everyStepType();
    def.steps.push({
      id: "goal-again",
      type: "single_choice",
      answerKey: "goal",
      title: "t",
      options: [{ value: "pitching", label: "Pitching" }],
    });
    expect(ok(def)).toBe(false);

    const loaderTwice = everyStepType();
    loaderTwice.steps.push({
      id: "loader-2",
      type: "loader_with_questions",
      title: "t",
      checklist: [],
      durationMs: 1000,
      questions: [{ atPct: 50, answerKey: "reminders", title: "Again?" }],
    });
    expect(ok(loaderTwice)).toBe(false);
  });

  it("rejects bad numbers on timed steps", () => {
    const loader = (atPct: number, durationMs = 1000) =>
      withStep({
        id: "l",
        type: "loader_with_questions",
        title: "t",
        checklist: [],
        durationMs,
        questions: [{ atPct, answerKey: "reminders", title: "q" }],
      });
    expect(ok(loader(50))).toBe(true);
    expect(ok(loader(0))).toBe(false);
    expect(ok(loader(100))).toBe(false);
    expect(ok(loader(50, 0))).toBe(false);
    expect(
      ok(
        withStep({ id: "v", type: "video_lesson", title: "t", takeaways: [], unlockAfterSec: 1.5 }),
      ),
    ).toBe(false);
  });
});

describe("FunnelRuleSchema", () => {
  const rule = (value: unknown) => FunnelRuleSchema.safeParse(value).success;

  it("accepts every operator", () => {
    expect(rule({ answer: "goal", op: "notEquals", value: "pitching" })).toBe(true);
    expect(rule({ answer: "time", op: "in", values: ["5", "10"] })).toBe(true);
    expect(rule({ answer: "situations", op: "includes", value: "calls" })).toBe(true);
    expect(rule({ answer: "focus", op: "answered" })).toBe(true);
  });

  it("rejects rules on unknown keys or with values the key doesn't allow", () => {
    expect(rule({ answer: "email", op: "answered" })).toBe(false);
    expect(rule({ answer: "goal", op: "equals", value: "world-domination" })).toBe(false);
    expect(rule({ answer: "self-rating", op: "in", values: [3, 9] })).toBe(false);
    expect(rule({ answer: "symptoms", op: "includes", value: "pitching" })).toBe(false);
    // `includes` is for multi-select answers; `equals` is for single answers.
    expect(rule({ answer: "goal", op: "includes", value: "pitching" })).toBe(false);
    expect(rule({ answer: "symptoms", op: "equals", value: "fillers" })).toBe(false);
    expect(rule({ answer: "goal", op: "matches", value: ".*" })).toBe(false);
  });

  it("rejects a disallowed rule value inside a step's showIf", () => {
    expect(
      ok(
        withStep({
          id: "x",
          type: "paywall",
          showIf: { not: { answer: "reminders", op: "equals", value: "maybe" } },
        }),
      ),
    ).toBe(false);
  });

  it("allows nesting up to 5 levels, not deeper", () => {
    const leaf = { answer: "goal", op: "answered" };
    const nest = (levels: number): unknown => (levels === 1 ? leaf : { not: nest(levels - 1) });
    expect(rule(nest(5))).toBe(true);
    expect(rule(nest(6))).toBe(false);
    expect(rule({ all: [leaf, { any: [{ not: { all: [{ not: leaf }] } }] }] })).toBe(false);
  });
});

describe("TemplateTextSchema", () => {
  const text = (value: string) => TemplateTextSchema.safeParse(value).success;

  it("accepts plain text and answer placeholders with optional fallbacks", () => {
    expect(text("Hello there")).toBe(true);
    expect(text("Your goal: {{answer:goal}}")).toBe(true);
    expect(text("{{answer:self-rating|3}} out of 5, {{answer:practice-now|no}}")).toBe(true);
  });

  it("rejects unknown keys and any other {{…}} form", () => {
    expect(text("{{answer:email}}")).toBe(false);
    expect(text("{{user.name}}")).toBe(false);
    expect(text("{{ answer:goal }}")).toBe(false);
    expect(text("Broken {{answer:goal")).toBe(false);
    expect(text("")).toBe(false);
  });
});
