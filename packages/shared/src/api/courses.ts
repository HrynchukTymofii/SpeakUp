import { z } from "zod";

/** Lesson/exercise slugs: lowercase words joined by dashes (matches the seed data). */
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid slug")
  .max(100);

export const ExerciseTypeSchema = z.enum(["read_aloud", "free_speech"]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

export const ExerciseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  type: ExerciseTypeSchema,
  prompt: z.string(),
  referenceText: z.string().nullable(), // set for read_aloud only
  maxDurationSec: z.number().int(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

/** A lesson as listed in a course: no body/exercises, plus the per-user `locked` flag. */
export const LessonSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  order: z.number().int(),
  isFree: z.boolean(),
  locked: z.boolean(),
  /**
   * The lesson's exercise slugs, so the app can tell which lessons are done from the attempt
   * history. Optional: the web app may be deployed before the API that sends it.
   */
  exerciseSlugs: z.array(z.string()).optional(),
});
export type LessonSummary = z.infer<typeof LessonSummarySchema>;

/** GET /v1/courses */
export const CoursesResponseSchema = z.object({
  courses: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      lessons: z.array(LessonSummarySchema),
    }),
  ),
});
export type CoursesResponse = z.infer<typeof CoursesResponseSchema>;

/** GET /v1/lessons/:slug — only returned when the lesson is unlocked for the user. */
export const LessonResponseSchema = z.object({
  lesson: z.object({
    slug: z.string(),
    title: z.string(),
    order: z.number().int(),
    videoUrl: z.string().nullable(),
    body: z.string(), // markdown
    course: z.object({ slug: z.string(), title: z.string() }),
    exercises: z.array(ExerciseSchema),
  }),
});
export type LessonResponse = z.infer<typeof LessonResponseSchema>;

/** GET /v1/exercises/baseline */
export const ExerciseResponseSchema = z.object({ exercise: ExerciseSchema });
export type ExerciseResponse = z.infer<typeof ExerciseResponseSchema>;

/**
 * GET /v1/exercises/practice — standalone exercises for the Practice feed and Challenges:
 * quick drills (`drill-*`), "speak like a legend" read-alouds (`legend-*`) and challenge
 * exercises (`challenge-*`). Open to every plan, like the baseline.
 */
export const PracticeExercisesResponseSchema = z.object({ exercises: z.array(ExerciseSchema) });
export type PracticeExercisesResponse = z.infer<typeof PracticeExercisesResponseSchema>;

/** GET /v1/practice/:mode/next: the mode's exercise and a topic the user hasn't done yet. */
export const NextTopicResponseSchema = z.object({
  exercise: ExerciseSchema,
  topic: z.string(),
  /** How many topics of the bank the user has done, of how many. */
  done: z.number().int(),
  total: z.number().int(),
});
export type NextTopicResponse = z.infer<typeof NextTopicResponseSchema>;

/** Slug prefixes of the standalone practice exercises. */
export const PRACTICE_SLUG_PREFIXES = ["drill-", "legend-", "challenge-"] as const;
