import { describe, expect, it } from "vitest";
import { FUNNEL_OPTIONS, speakingCheckSlug } from "@speakup/shared";
import { baselineExercise, course, speakingChecks, type SeedExercise } from "./seed-data.js";

const wordCount = (text: string) => text.trim().split(/\s+/).length;
const allExercises: SeedExercise[] = [
  baselineExercise,
  ...speakingChecks,
  ...course.lessons.flatMap((lesson) => lesson.exercises),
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

  it("has 3 lessons and only Lesson 1 is free", () => {
    expect(course.lessons).toHaveLength(3);
    expect(course.lessons.map((l) => l.isFree)).toEqual([true, false, false]);
  });

  it("every lesson has 1–2 exercises", () => {
    for (const lesson of course.lessons) {
      expect(lesson.exercises.length).toBeGreaterThanOrEqual(1);
      expect(lesson.exercises.length).toBeLessThanOrEqual(2);
    }
  });

  it("every read_aloud exercise has reference text", () => {
    for (const ex of allExercises.filter((e) => e.type === "read_aloud")) {
      expect(ex.referenceText, ex.slug).toBeTruthy();
    }
  });

  it("slugs are unique (they are the upsert keys)", () => {
    const lessonSlugs = course.lessons.map((l) => l.slug);
    const exerciseSlugs = allExercises.map((e) => e.slug);
    expect(new Set(lessonSlugs).size).toBe(lessonSlugs.length);
    expect(new Set(exerciseSlugs).size).toBe(exerciseSlugs.length);
  });
});
