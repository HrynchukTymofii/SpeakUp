import type { Plan } from "@speakup/shared";

/**
 * Content access rule (SPEC §1 plans table): Free users get free lessons (Lesson 1),
 * Pro users get every lesson.
 *
 * Kept as one pure function used by BOTH the course list (to compute `locked`) and the
 * lesson endpoint (to return 403) — so what the UI shows as locked can never drift from
 * what the API actually enforces. Exercise access in M4 will reuse it too.
 */
export function canAccessLesson(lesson: { isFree: boolean }, plan: Plan): boolean {
  return lesson.isFree || plan === "pro";
}
