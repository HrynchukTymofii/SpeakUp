import {
  FUNNEL_OPTIONS,
  ProblemSchema,
  type AttemptSummary,
  type OnboardingAnswers,
  type Problem,
} from "@speakup/shared";
import { BASICS_COURSE, GOAL_COURSE, LESSON_FIXES, SYMPTOM_PROBLEM } from "./catalog";

/**
 * What to learn next, per user. Two inputs:
 * - the goal from the funnel ("I want to pitch") decides which course leads the Learn tab;
 * - the problems found in recent recordings (or, before any analysis, the symptoms the user
 *   reported) decide which lessons we suggest — so someone without filler words is never sent
 *   to the filler lesson.
 */

export interface LearnLesson {
  slug: string;
  title: string;
  locked: boolean;
  exerciseSlugs: string[];
}

export interface LearnCourse {
  slug: string;
  title: string;
  summary: string;
  lessons: LearnLesson[];
}

export type Goal = (typeof FUNNEL_OPTIONS.goal)[number]["value"];

export function goalOf(onboarding: OnboardingAnswers | null | undefined): Goal | undefined {
  const goal = onboarding?.goal;
  return FUNNEL_OPTIONS.goal.find((o) => o.value === goal)?.value;
}

/** The goal's course first, then the basics, then everything else in its original order. */
export function orderCourses<C extends { slug: string }>(
  courses: C[],
  goal: Goal | undefined,
): C[] {
  const lead = goal ? GOAL_COURSE[goal] : undefined;
  const rank = (slug: string) => (slug === lead ? 0 : slug === BASICS_COURSE ? 1 : 2);
  // Array.prototype.sort is stable, so equal ranks keep the API's order.
  return [...courses].sort((a, b) => rank(a.slug) - rank(b.slug));
}

/** How many recent analyzed recordings to look at: recent habits, not old ones. */
const RECENT_ANALYSES = 5;
const MAX_SUGGESTIONS = 3;

export interface Suggestion {
  lesson: LearnLesson;
  course: LearnCourse;
  problem: Problem;
  /** Measured in a recording, or reported by the user in the funnel. */
  source: "analysis" | "self-reported";
}

function rankedProblems(
  attempts: AttemptSummary[],
  onboarding: OnboardingAnswers | null | undefined,
): { problem: Problem; source: Suggestion["source"] }[] {
  const recent = attempts.filter((a) => a.status === "completed").slice(0, RECENT_ANALYSES);
  if (recent.length > 0) {
    const counts = new Map<Problem, number>();
    for (const a of recent) for (const p of a.problems) counts.set(p, (counts.get(p) ?? 0) + 1);
    const order = ProblemSchema.options;
    return [...counts.entries()]
      .sort(([pa, a], [pb, b]) => b - a || order.indexOf(pa) - order.indexOf(pb))
      .map(([problem]) => ({ problem, source: "analysis" }));
  }

  const symptoms = onboarding?.symptoms;
  const list = Array.isArray(symptoms) ? symptoms : [];
  return list.flatMap((s) => {
    const problem = SYMPTOM_PROBLEM[s];
    return problem ? [{ problem, source: "self-reported" as const }] : [];
  });
}

export function recommendLessons({
  courses,
  attempts,
  onboarding,
  completed,
}: {
  courses: LearnCourse[];
  attempts: AttemptSummary[];
  onboarding: OnboardingAnswers | null | undefined;
  completed: Set<string>;
}): Suggestion[] {
  const lessons = courses.flatMap((course) => course.lessons.map((lesson) => ({ course, lesson })));
  const isDone = (l: LearnLesson) =>
    l.exerciseSlugs.length > 0 && l.exerciseSlugs.every((s) => completed.has(s));

  const suggestions: Suggestion[] = [];
  for (const { problem, source } of rankedProblems(attempts, onboarding)) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    const match = lessons.find(
      ({ lesson }) =>
        LESSON_FIXES[lesson.slug]?.includes(problem) &&
        !isDone(lesson) &&
        !suggestions.some((s) => s.lesson.slug === lesson.slug),
    );
    if (match) suggestions.push({ ...match, problem, source });
  }
  return suggestions;
}
