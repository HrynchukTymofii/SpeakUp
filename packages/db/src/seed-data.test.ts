import { describe, expect, it } from "vitest";
import { FUNNEL_OPTIONS, PRACTICE_SLUG_PREFIXES, speakingCheckSlug } from "@speakup/shared";
import {
  baselineExercise,
  courses,
  practiceExercises,
  speakingChecks,
  type SeedExercise,
} from "./seed-data.js";

const wordCount = (text: string) => text.trim().split(/\s+/).length;
const lessons = courses.flatMap((c) => c.lessons);
const allExercises: SeedExercise[] = [
  baselineExercise,
  ...speakingChecks,
  ...practiceExercises,
  ...lessons.flatMap((lesson) => lesson.exercises),
];

describe("seed data", () => {
  it("baseline is a ~70-word read-aloud capped at 45 s", () => {
    expect(baselineExercise.slug).toBe("baseline");
    expect(baselineExercise.type).toBe("read_aloud");
    expect(baselineExercise.maxDurationSec).toBeLessThanOrEqual(45);
    const words = wordCount(baselineExercise.referenceText ?? "");
    expect(words).toBeGreaterThanOrEqual(60);
    expect(words).toBeLessThanOrEqual(80);
  });

  it("has an impromptu speaking check for every funnel goal, plus a general one", () => {
    const slugs = new Set(speakingChecks.map((c) => c.slug));
    for (const goal of FUNNEL_OPTIONS.goal) {
      expect(slugs.has(speakingCheckSlug(goal.value)), goal.value).toBe(true);
    }
    expect(slugs.has(speakingCheckSlug(undefined))).toBe(true);
    for (const c of speakingChecks) {
      expect(c.type).toBe("free_speech");
      expect(c.maxDurationSec).toBeLessThanOrEqual(45);
    }
  });

  it("has a basics course plus one course per goal track", () => {
    expect(courses.map((c) => c.slug)).toEqual([
      "speak-with-confidence",
      "be-interesting",
      "pitch-prep",
      "presentation-prep",
      "job-interviews",
      "meetings",
    ]);
  });

  it("keeps the original lessons and exercises (attempts reference them)", () => {
    const slugs = new Set(allExercises.map((e) => e.slug));
    for (const slug of [
      "find-your-pace-read",
      "find-your-pace-intro",
      "power-of-the-pause-read",
      "cut-the-filler-explain",
      "cut-the-filler-opinion",
    ]) {
      expect(slugs.has(slug), slug).toBe(true);
    }
  });

  it("the first lesson of every course is free", () => {
    for (const course of courses) {
      expect(course.lessons[0]?.isFree, course.slug).toBe(true);
    }
  });

  it("every lesson explains, shows an example, gives steps, and has 2–3 exercises", () => {
    for (const lesson of lessons) {
      expect(lesson.body, lesson.slug).toMatch(/^## /);
      expect(lesson.body, lesson.slug).toContain("## Example");
      expect(lesson.body, lesson.slug).toContain("## Try this");
      expect(lesson.exercises.length, lesson.slug).toBeGreaterThanOrEqual(2);
      expect(lesson.exercises.length, lesson.slug).toBeLessThanOrEqual(3);
    }
  });

  it("every line of prose is its own paragraph (markdown would merge single line breaks)", () => {
    for (const lesson of lessons) {
      // A text line directly followed by another text line (not a list item) renders as one
      // run-on paragraph, e.g. "Vague: … Sharp: …" in an example.
      expect(lesson.body, lesson.slug).not.toMatch(/[^\n]\n(?!- |\n)[^\n]/);
    }
  });

  it("lesson orders are 1..n within each course", () => {
    for (const course of courses) {
      expect(course.lessons.map((l) => l.order)).toEqual(course.lessons.map((_, i) => i + 1));
    }
  });

  it("practice exercises use the practice slug prefixes and cover each drill kind", () => {
    for (const ex of practiceExercises) {
      expect(
        PRACTICE_SLUG_PREFIXES.some((p) => ex.slug.startsWith(p)),
        ex.slug,
      ).toBe(true);
    }
    for (const kind of ["drill-topic-", "drill-questions-", "drill-convince-", "drill-twister-"]) {
      const count = practiceExercises.filter((e) => e.slug.startsWith(kind)).length;
      expect(count, kind).toBeGreaterThan(1);
    }
    expect(practiceExercises.some((e) => e.slug === "challenge-your-story")).toBe(true);
    for (const legend of practiceExercises.filter((e) => e.slug.startsWith("legend-"))) {
      expect(legend.type, legend.slug).toBe("read_aloud");
    }
  });

  it("no exercise is longer than 2 minutes", () => {
    for (const ex of allExercises) expect(ex.maxDurationSec, ex.slug).toBeLessThanOrEqual(120);
  });

  it("every read_aloud exercise has reference text", () => {
    for (const ex of allExercises.filter((e) => e.type === "read_aloud")) {
      expect(ex.referenceText, ex.slug).toBeTruthy();
    }
  });

  it("slugs are unique (they are the upsert keys)", () => {
    const lessonSlugs = lessons.map((l) => l.slug);
    const exerciseSlugs = allExercises.map((e) => e.slug);
    expect(new Set(lessonSlugs).size).toBe(lessonSlugs.length);
    expect(new Set(exerciseSlugs).size).toBe(exerciseSlugs.length);
  });
});
