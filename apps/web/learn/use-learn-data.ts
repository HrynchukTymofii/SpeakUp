"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApi } from "@/lib/use-api";
import { BASICS_COURSE, CONFIDENCE_COURSE } from "./catalog";
import { useLocalDone } from "./local-progress";
import {
  goalOf,
  orderCourses,
  recommendLessons,
  type Goal,
  type LearnCourse,
  type Suggestion,
} from "./personalize";
import { completedSlugs, levelFor, streakDays, todayCount, totalXp } from "./progress";

/** Query keys shared by every learning screen, so they read one cache. */
export const learnKeys = {
  me: ["me"] as const,
  courses: ["courses"] as const,
  attempts: ["attempts"] as const,
  practice: ["practice-exercises"] as const,
};

/** In-app lessons count as "done" through a pseudo exercise slug. */
export const localSlug = (lessonSlug: string) => `local:${lessonSlug}`;

/** The confidence course in the same shape as an API course (always unlocked). */
const confidenceCourse: LearnCourse = {
  slug: CONFIDENCE_COURSE.slug,
  title: CONFIDENCE_COURSE.title,
  summary: CONFIDENCE_COURSE.summary,
  lessons: CONFIDENCE_COURSE.lessons.map((l) => ({
    slug: l.slug,
    title: l.title,
    locked: false,
    exerciseSlugs: [localSlug(l.slug)],
  })),
};

export interface LearnData {
  goal: Goal | undefined;
  courses: LearnCourse[];
  completed: Set<string>;
  suggestions: Suggestion[];
  streak: number;
  today: number;
  xp: number;
  level: ReturnType<typeof levelFor>;
  hasAnalysis: boolean;
}

/**
 * Everything the Learn tab, lesson pages and profile need, derived from three API calls (me,
 * courses, history) plus browser-only progress. Returns null while loading.
 */
export function useLearnData() {
  const api = useApi();
  const me = useQuery({ queryKey: learnKeys.me, queryFn: () => api.getMe() });
  const courses = useQuery({ queryKey: learnKeys.courses, queryFn: () => api.getCourses() });
  const attempts = useQuery({ queryKey: learnKeys.attempts, queryFn: () => api.getAttempts() });
  const [localDone] = useLocalDone();

  const data = useMemo<LearnData | null>(() => {
    if (!me.data || !courses.data || !attempts.data) return null;
    const history = attempts.data.attempts;
    const onboarding = me.data.user.onboarding;
    const goal = goalOf(onboarding);

    const apiCourses: LearnCourse[] = courses.data.courses.map((c) => ({
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      lessons: c.lessons.map((l) => ({
        slug: l.slug,
        title: l.title,
        locked: l.locked,
        exerciseSlugs: l.exerciseSlugs ?? [],
      })),
    }));
    const ordered = orderCourses(apiCourses, goal);
    // The confidence routines sit right after the basics: useful before any speaking task.
    const basicsAt = ordered.findIndex((c) => c.slug === BASICS_COURSE);
    ordered.splice(basicsAt + 1, 0, confidenceCourse);

    const completed = completedSlugs(history);
    for (const slug of localDone) completed.add(localSlug(slug));
    const xp = totalXp(history);

    return {
      goal,
      courses: ordered,
      completed,
      suggestions: recommendLessons({ courses: ordered, attempts: history, onboarding, completed }),
      streak: streakDays(history),
      today: todayCount(history),
      xp,
      level: levelFor(xp),
      hasAnalysis: history.some((a) => a.status === "completed"),
    };
  }, [me.data, courses.data, attempts.data, localDone]);

  const error = me.error ?? courses.error ?? attempts.error;
  return { data, error, me: me.data, history: attempts.data?.attempts ?? [] };
}
