/**
 * `pnpm db:seed` → `prisma db seed` → this file (configured in prisma.config.ts).
 *
 * Idempotent: everything is upserted by its unique `slug`, so running the seed twice
 * updates content instead of creating duplicates or failing. Safe to re-run after editing copy.
 */
import { createDbClient } from "../src/client.js";
import { baselineExercise, course, speakingChecks, type SeedExercise } from "../src/seed-data.js";

const databaseUrl = process.env.DATABASE_URL; // loaded by prisma.config.ts
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

// Placeholder lesson video (SPEC §5: configurable). Empty → lessons have no video yet.
const videoUrl = process.env.SEED_LESSON_VIDEO_URL || null;

const db = createDbClient(databaseUrl);

function exerciseFields(ex: SeedExercise, lessonId: string | null) {
  return {
    lessonId,
    type: ex.type,
    prompt: ex.prompt,
    referenceText: ex.referenceText ?? null,
    maxDurationSec: ex.maxDurationSec,
    order: ex.order,
  };
}

async function main(): Promise<void> {
  // One transaction: the content is either fully seeded or not at all.
  await db.$transaction(async (tx) => {
    const { lessons, ...courseFields } = course;
    const dbCourse = await tx.course.upsert({
      where: { slug: course.slug },
      create: courseFields,
      update: courseFields,
    });

    for (const { exercises, ...lesson } of lessons) {
      const lessonFields = { ...lesson, courseId: dbCourse.id, videoUrl };
      const dbLesson = await tx.lesson.upsert({
        where: { slug: lesson.slug },
        create: lessonFields,
        update: lessonFields,
      });

      for (const ex of exercises) {
        const fields = exerciseFields(ex, dbLesson.id);
        await tx.exercise.upsert({
          where: { slug: ex.slug },
          create: { slug: ex.slug, ...fields },
          update: fields,
        });
      }
    }

    // Baseline assessment exercise: not part of any lesson (lessonId = null).
    const baselineFields = exerciseFields(baselineExercise, null);
    await tx.exercise.upsert({
      where: { slug: baselineExercise.slug },
      create: { slug: baselineExercise.slug, ...baselineFields },
      update: baselineFields,
    });

    // The funnel's speaking checks (one per goal), also standalone.
    for (const ex of speakingChecks) {
      const fields = exerciseFields(ex, null);
      await tx.exercise.upsert({
        where: { slug: ex.slug },
        create: { slug: ex.slug, ...fields },
        update: fields,
      });
    }
  });

  const [courses, lessonCount, exerciseCount] = await Promise.all([
    db.course.count(),
    db.lesson.count(),
    db.exercise.count(),
  ]);
  console.log(`Seeded: ${courses} course(s), ${lessonCount} lessons, ${exerciseCount} exercises`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
