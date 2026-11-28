/**
 * `pnpm db:seed` → `prisma db seed` → this file (configured in prisma.config.ts).
 *
 * Idempotent: everything is upserted by its unique `slug`, so running the seed twice
 * updates content instead of creating duplicates or failing. Safe to re-run after editing copy.
 * The exception is the default funnel: it is only created, never updated (see below).
 */
import { FunnelDefinitionSchema } from "@speakup/shared";
import { createDbClient } from "../src/client.js";
import {
  baselineExercise,
  courses,
  defaultFunnel,
  practiceExercises,
  speakingChecks,
  type SeedExercise,
} from "../src/seed-data.js";

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

/**
 * Prisma's defaults (wait 2 s to start a transaction, 5 s to finish it) are made for request
 * handlers. The seed runs against remote databases too: a serverless Postgres (Neon) can take
 * several seconds to wake up, and ~100 upserts each cross the network. Content seeding is rare
 * and one-off, so generous limits cost nothing.
 */
const SEED_TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 120_000 } as const;

async function main(): Promise<void> {
  // Fail before touching the database: the API serves this JSON to the web funnel as stored.
  const funnelDefinition = FunnelDefinitionSchema.parse(defaultFunnel.definition);

  // One transaction: the content is either fully seeded or not at all.
  await db.$transaction(async (tx) => {
    for (const { lessons, ...courseFields } of courses) {
      const dbCourse = await tx.course.upsert({
        where: { slug: courseFields.slug },
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
    }

    // Baseline assessment exercise: not part of any lesson (lessonId = null).
    const baselineFields = exerciseFields(baselineExercise, null);
    await tx.exercise.upsert({
      where: { slug: baselineExercise.slug },
      create: { slug: baselineExercise.slug, ...baselineFields },
      update: baselineFields,
    });

    // The funnel's speaking checks (one per goal) and the practice exercises (drills, legends,
    // challenges): standalone, like the baseline.
    for (const ex of [...speakingChecks, ...practiceExercises]) {
      const fields = exerciseFields(ex, null);
      await tx.exercise.upsert({
        where: { slug: ex.slug },
        create: { slug: ex.slug, ...fields },
        update: fields,
      });
    }

    // Default funnel `main`: create-only (`update: {}`). Once it exists it is edited in the
    // database; a re-seed must not overwrite a live funnel or reset its version.
    await tx.funnel.upsert({
      where: { slug: defaultFunnel.slug },
      create: { ...defaultFunnel, definition: funnelDefinition },
      update: {},
    });
  }, SEED_TRANSACTION_OPTIONS);

  const [courseCount, lessonCount, exerciseCount, funnelCount] = await Promise.all([
    db.course.count(),
    db.lesson.count(),
    db.exercise.count(),
    db.funnel.count(),
  ]);
  console.log(
    `Seeded: ${courseCount} course(s), ${lessonCount} lessons, ${exerciseCount} exercises, ${funnelCount} funnel(s)`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
