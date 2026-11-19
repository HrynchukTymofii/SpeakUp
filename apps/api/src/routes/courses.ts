import type { DbClient } from "@speakup/db";
import {
  CoursesResponseSchema,
  ErrorCode,
  ExerciseResponseSchema,
  LessonResponseSchema,
  MAX_TOPIC_LENGTH,
  MODE_EXERCISE_SLUG,
  MODE_TOPICS,
  NextTopicResponseSchema,
  PRACTICE_MODES,
  PRACTICE_SLUG_PREFIXES,
  pickTopic,
  PracticeExercisesResponseSchema,
  SlugSchema,
} from "@speakup/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { currentUser } from "../plugins/auth.js";
import { AppError } from "../plugins/error-handler.js";
import { canAccessLesson } from "../services/access.js";
import { getEntitlements } from "../services/entitlements.js";

interface CourseRoutesOptions {
  db: DbClient;
  limits: { free: number; pro: number };
}

/** The exercise fields clients may see (never internal columns like lessonId/order). */
export const exerciseSelect = {
  id: true,
  slug: true,
  type: true,
  prompt: true,
  referenceText: true,
  maxDurationSec: true,
} as const;

/** Content routes. Must be registered inside a `requireAuth` scope. */
export const courseRoutes: FastifyPluginAsyncZod<CourseRoutesOptions> = async (
  app,
  { db, limits },
) => {
  /** All courses with their lessons, each flagged `locked` for the current user. */
  app.get("/courses", { schema: { response: { 200: CoursesResponseSchema } } }, async (request) => {
    const user = currentUser(request);
    // Independent queries → run in parallel.
    const [{ plan }, courses] = await Promise.all([
      getEntitlements(db, user.id, limits),
      db.course.findMany({
        orderBy: { order: "asc" },
        select: {
          slug: true,
          title: true,
          summary: true,
          lessons: {
            orderBy: { order: "asc" },
            select: {
              slug: true,
              title: true,
              order: true,
              isFree: true,
              exercises: { orderBy: { order: "asc" }, select: { slug: true } },
            },
          },
        },
      }),
    ]);

    return {
      courses: courses.map((course) => ({
        ...course,
        lessons: course.lessons.map(({ exercises, ...lesson }) => ({
          ...lesson,
          locked: !canAccessLesson(lesson, plan),
          exerciseSlugs: exercises.map((e) => e.slug),
        })),
      })),
    };
  });

  /** One lesson with body + exercises. 404 if unknown, 403 LESSON_LOCKED if not in the plan. */
  app.get(
    "/lessons/:slug",
    {
      schema: {
        params: z.object({ slug: SlugSchema }),
        response: { 200: LessonResponseSchema },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const [{ plan }, lesson] = await Promise.all([
        getEntitlements(db, user.id, limits),
        db.lesson.findUnique({
          where: { slug: request.params.slug },
          select: {
            slug: true,
            title: true,
            order: true,
            isFree: true,
            videoUrl: true,
            body: true,
            course: { select: { slug: true, title: true } },
            exercises: { orderBy: { order: "asc" }, select: exerciseSelect },
          },
        }),
      ]);

      if (!lesson) throw new AppError(404, ErrorCode.NOT_FOUND, "Lesson not found");
      // Enforced on the server: hiding the link in the UI is not access control.
      if (!canAccessLesson(lesson, plan)) {
        throw new AppError(403, ErrorCode.LESSON_LOCKED, "This lesson is part of SpeakUp Pro");
      }

      const { isFree: _isFree, ...publicLesson } = lesson;
      return { lesson: publicLesson };
    },
  );

  /** The standalone baseline assessment (seeded with slug "baseline", no lesson). */
  app.get(
    "/exercises/baseline",
    { schema: { response: { 200: ExerciseResponseSchema } } },
    async () => {
      const exercise = await db.exercise.findUnique({
        where: { slug: "baseline" },
        select: exerciseSelect,
      });
      // Missing baseline = DB wasn't seeded. That's a server problem, not a client one.
      if (!exercise) throw new Error("Baseline exercise missing — run `pnpm db:seed`");
      return { exercise };
    },
  );

  /**
   * Standalone practice exercises (Practice feed, Challenges). They have no lesson, so — like
   * the baseline — every plan may record them; the daily analysis quota still applies.
   */
  app.get(
    "/exercises/practice",
    { schema: { response: { 200: PracticeExercisesResponseSchema } } },
    async () => {
      const exercises = await db.exercise.findMany({
        where: {
          lessonId: null,
          OR: PRACTICE_SLUG_PREFIXES.map((prefix) => ({ slug: { startsWith: prefix } })),
        },
        orderBy: [{ order: "asc" }, { slug: "asc" }],
        select: exerciseSelect,
      });
      return { exercises };
    },
  );

  /**
   * Practice modes: the mode's exercise plus a random topic the user hasn't answered yet
   * (topics come back only after the whole bank is done). `skip` = the topic the user just
   * passed on, so "another topic" never returns the same one.
   */
  app.get(
    "/practice/:mode/next",
    {
      schema: {
        params: z.object({ mode: z.enum(PRACTICE_MODES) }),
        querystring: z.object({ skip: z.string().max(MAX_TOPIC_LENGTH).optional() }),
        response: { 200: NextTopicResponseSchema },
      },
    },
    async (request) => {
      const { mode } = request.params;
      const exercise = await db.exercise.findUnique({
        where: { slug: MODE_EXERCISE_SLUG[mode] },
        select: exerciseSelect,
      });
      if (!exercise) throw new AppError(404, ErrorCode.NOT_FOUND, "Practice mode not found");

      // Every attempt counts as "answered", even a failed one: the user did see the topic.
      const rows = await db.attempt.findMany({
        where: { userId: currentUser(request).id, exerciseId: exercise.id, topic: { not: null } },
        select: { topic: true },
      });
      const used = new Map<string, number>();
      for (const { topic } of rows) if (topic) used.set(topic, (used.get(topic) ?? 0) + 1);

      return { exercise, ...pickTopic(MODE_TOPICS[mode], used, request.query.skip) };
    },
  );
};
