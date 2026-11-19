import { ProblemSchema, type AttemptSummary, type Problem, type Skill } from "@speakup/shared";

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

/** How many recent analyses the profile summarizes. */
const PROFILE_WINDOW = 10;

const recentCompleted = (attempts: AttemptSummary[]) =>
  attempts.filter((a) => a.status === "completed").slice(0, PROFILE_WINDOW);

/** Average score per skill over the recent analyses that measured it (history is newest first). */
export function averageSkills(attempts: AttemptSummary[]): { skill: Skill; score: number }[] {
  const sums = new Map<Skill, { total: number; count: number }>();
  for (const a of recentCompleted(attempts)) {
    for (const { skill, score } of a.subscores ?? []) {
      const entry = sums.get(skill) ?? { total: 0, count: 0 };
      sums.set(skill, { total: entry.total + score, count: entry.count + 1 });
    }
  }
  return [...sums.entries()].map(([skill, { total, count }]) => ({
    skill,
    score: Math.round(total / count),
  }));
}

/** Recent overall scores, oldest → newest (for a left-to-right chart). */
export function scoreTrend(attempts: AttemptSummary[]): number[] {
  return recentCompleted(attempts)
    .flatMap((a) => (a.overallScore === null ? [] : [a.overallScore]))
    .reverse();
}

/** Problems found in recent analyses, most frequent first. */
export function recentProblems(attempts: AttemptSummary[]): { problem: Problem; count: number }[] {
  const counts = new Map<Problem, number>();
  for (const a of recentCompleted(attempts)) {
    for (const p of a.problems) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const order = ProblemSchema.options;
  return [...counts.entries()]
    .map(([problem, count]) => ({ problem, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.problem) - order.indexOf(b.problem));
}

export const STORY_CHALLENGE_SLUG = "challenge-your-story";
export const STORY_CHALLENGE_DAYS = 7;

/**
 * The 7-day story challenge: tell the same (self-written) story once a day. Progress = distinct
 * days with a completed recording, capped at 7; `scores` (oldest → newest, best of each day)
 * show the story getting better.
 */
export function storyChallenge(
  attempts: AttemptSummary[],
  now = new Date(),
): { daysDone: number; doneToday: boolean; scores: number[] } {
  const bestPerDay = new Map<string, number>();
  for (const a of attempts) {
    if (a.exerciseSlug !== STORY_CHALLENGE_SLUG || a.status !== "completed") continue;
    const key = dayKey(new Date(a.createdAt));
    bestPerDay.set(key, Math.max(bestPerDay.get(key) ?? 0, a.overallScore ?? 0));
  }
  const days = [...bestPerDay.keys()].sort();
  return {
    daysDone: Math.min(days.length, STORY_CHALLENGE_DAYS),
    doneToday: bestPerDay.has(dayKey(now)),
    scores: days.slice(0, STORY_CHALLENGE_DAYS).map((d) => bestPerDay.get(d) ?? 0),
  };
}
