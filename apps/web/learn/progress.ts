import type { AttemptSummary } from "@speakup/shared";

/**
 * Progress, streak and XP — all derived from the attempt history (GET /v1/attempts), so there
 * is no extra state to keep in sync. Days are the user's *local* calendar days.
 */

/** Exercise slugs the user has at least one completed (analyzed) recording for. */
export function completedSlugs(attempts: AttemptSummary[]): Set<string> {
  return new Set(attempts.filter((a) => a.status === "completed").map((a) => a.exerciseSlug));
}

export type LessonState = "done" | "started" | "new";

export function lessonState(exerciseSlugs: string[], completed: Set<string>): LessonState {
  const done = exerciseSlugs.filter((slug) => completed.has(slug)).length;
  if (exerciseSlugs.length > 0 && done === exerciseSlugs.length) return "done";
  return done > 0 ? "started" : "new";
}

export type PathState = "done" | "current" | "open" | "locked";

/** Lesson nodes on the path: the first unfinished, unlocked lesson is the one to do next. */
export function pathStates(lessons: { state: LessonState; locked: boolean }[]): PathState[] {
  let currentAssigned = false;
  return lessons.map(({ state, locked }) => {
    if (locked) return "locked";
    if (state === "done") return "done";
    if (!currentAssigned) {
      currentAssigned = true;
      return "current";
    }
    return "open";
  });
}

/** Local calendar day as `YYYY-MM-DD`. */
function dayKey(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function completedDays(attempts: AttemptSummary[]): Set<string> {
  return new Set(
    attempts.filter((a) => a.status === "completed").map((a) => dayKey(new Date(a.createdAt))),
  );
}

/**
 * Consecutive days with at least one completed recording. A streak that reached yesterday is
 * still alive today (the user has until midnight to extend it).
 */
export function streakDays(attempts: AttemptSummary[], now = new Date()): number {
  const days = completedDays(attempts);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Completed recordings today (for the daily goal ring). */
export function todayCount(attempts: AttemptSummary[], now = new Date()): number {
  const today = dayKey(now);
  return attempts.filter((a) => a.status === "completed" && dayKey(new Date(a.createdAt)) === today)
    .length;
}

export const DAILY_GOAL = 3;

/** 10 XP for showing up, plus up to 10 for the score: practice beats perfection. */
export function totalXp(attempts: AttemptSummary[]): number {
  return attempts
    .filter((a) => a.status === "completed")
    .reduce((sum, a) => sum + 10 + Math.round((a.overallScore ?? 0) / 10), 0);
}

const XP_PER_LEVEL = 100;

export function levelFor(xp: number): { level: number; intoLevel: number; perLevel: number } {
  return {
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    intoLevel: xp % XP_PER_LEVEL,
    perLevel: XP_PER_LEVEL,
  };
}
