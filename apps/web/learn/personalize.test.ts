import type { AttemptSummary, Problem } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { goalOf, orderCourses, recommendLessons, type LearnCourse } from "./personalize";

const lesson = (slug: string, locked = false, exerciseSlugs = [`${slug}-1`]) => ({
  slug,
  title: slug,
  locked,
  exerciseSlugs,
});

const courses: LearnCourse[] = [
  {
    slug: "speak-with-confidence",
    title: "Basics",
    summary: "",
    lessons: [
      lesson("power-of-the-pause"),
      lesson("cut-the-filler"),
      lesson("hit-the-key-word", true),
      lesson("finish-strong"),
    ],
  },
  { slug: "be-interesting", title: "Conversation", summary: "", lessons: [lesson("your-story")] },
  { slug: "pitch-prep", title: "Pitch", summary: "", lessons: [lesson("thirty-second-pitch")] },
];

let n = 0;
const analyzed = (problems: Problem[]): AttemptSummary => ({
  id: `a${n++}`,
  exerciseSlug: "check-general",
  status: "completed",
  createdAt: new Date(2026, 10, 19).toISOString(),
  overallScore: 60,
  subscores: null,
  problems,
});

describe("goalOf", () => {
  it("reads a known goal from the onboarding answers", () => {
    expect(goalOf({ goal: "pitching" })).toBe("pitching");
    expect(goalOf({ goal: "world-domination" })).toBeUndefined();
    expect(goalOf(null)).toBeUndefined();
  });
});

describe("orderCourses", () => {
  it("puts the goal's course first, then the basics, then the rest", () => {
    expect(orderCourses(courses, "pitching").map((c) => c.slug)).toEqual([
      "pitch-prep",
      "speak-with-confidence",
      "be-interesting",
    ]);
  });

  it("keeps the original order without a goal (basics first)", () => {
    expect(orderCourses(courses, undefined).map((c) => c.slug)).toEqual([
      "speak-with-confidence",
      "be-interesting",
      "pitch-prep",
    ]);
  });
});

describe("recommendLessons", () => {
  it("suggests the lesson that fixes the most frequent recent problem first", () => {
    const recs = recommendLessons({
      courses,
      attempts: [analyzed(["fillers"]), analyzed(["fillers", "trailing-off"])],
      onboarding: null,
      completed: new Set(),
    });
    expect(recs.map((r) => [r.lesson.slug, r.problem, r.source])).toEqual([
      ["cut-the-filler", "fillers", "analysis"],
      ["finish-strong", "trailing-off", "analysis"],
    ]);
  });

  it("skips lessons that are done; a locked lesson is still suggested", () => {
    const recs = recommendLessons({
      courses,
      attempts: [analyzed(["fillers", "monotone"])],
      onboarding: null,
      completed: new Set(["cut-the-filler-1"]),
    });
    expect(recs.map((r) => [r.lesson.slug, r.lesson.locked])).toEqual([["hit-the-key-word", true]]);
  });

  it("falls back to the symptoms the user reported in the funnel", () => {
    const recs = recommendLessons({
      courses,
      attempts: [],
      onboarding: { symptoms: ["fillers", "quiet"] },
      completed: new Set(),
    });
    expect(recs.map((r) => [r.lesson.slug, r.source])).toEqual([
      ["cut-the-filler", "self-reported"],
      ["finish-strong", "self-reported"],
    ]);
  });

  it("returns at most three suggestions", () => {
    const recs = recommendLessons({
      courses,
      attempts: [
        analyzed(["fillers", "hesitations", "skipped-punctuation", "trailing-off", "monotone"]),
      ],
      onboarding: null,
      completed: new Set(),
    });
    expect(recs).toHaveLength(3);
  });
});
