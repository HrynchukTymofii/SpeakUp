import type { Problem } from "@speakup/shared";

/**
 * App-side metadata for the learning content. Lesson text and exercises live in the DB (seeded
 * from packages/db/src/seed-data.ts); this file only adds what the app needs to *present* and
 * *personalize* it: which goal a course serves, how it looks, and which problem each lesson
 * fixes. Slugs here must match the seed.
 */

export const BASICS_COURSE = "speak-with-confidence";

/** Pastel accents from the design system (pastels always carry `text-on-pastel`). */
export type Tone = "peach" | "butter" | "sage" | "sky" | "lav" | "rose";

export interface CourseMeta {
  tone: Tone;
  /** One short emoji badge for the course card and path header. */
  icon: string;
}

export const COURSE_META: Record<string, CourseMeta> = {
  "speak-with-confidence": { tone: "peach", icon: "🎙️" },
  "be-interesting": { tone: "sage", icon: "💬" },
  "pitch-prep": { tone: "butter", icon: "🚀" },
  "presentation-prep": { tone: "lav", icon: "🎤" },
  "job-interviews": { tone: "sky", icon: "💼" },
  meetings: { tone: "rose", icon: "📋" },
  confidence: { tone: "sky", icon: "🧘" },
};

export const DEFAULT_META: CourseMeta = { tone: "peach", icon: "📘" };

/** The funnel goal → the course built for it. `clarity` is served by the basics. */
export const GOAL_COURSE: Record<string, string> = {
  pitching: "pitch-prep",
  presentations: "presentation-prep",
  "job-interviews": "job-interviews",
  meetings: "meetings",
  conversations: "be-interesting",
  clarity: BASICS_COURSE,
};

/**
 * Which detected problems each lesson fixes (see `detectProblems` in packages/shared). The
 * first lesson listed for a problem, in course order, is the one we suggest.
 */
export const LESSON_FIXES: Record<string, Problem[]> = {
  "find-your-pace": ["too-fast"],
  "power-of-the-pause": ["skipped-punctuation", "run-on", "too-fast"],
  "cut-the-filler": ["fillers", "hesitations"],
  "hit-the-key-word": ["monotone"],
  "change-the-pace": ["flat-pace", "run-on"],
  "finish-strong": ["trailing-off"],
  "say-it-like-you-mean-it": ["hedges"],
  "one-idea-three-points": ["structure"],
  "call-to-action": ["structure"],
};

/** Problems in plain words, as the user would say them. */
export const PROBLEM_LABEL: Record<Problem, string> = {
  fillers: "Filler words",
  hesitations: "Hesitations",
  "skipped-punctuation": "Reading through full stops",
  "run-on": "No breathing room",
  "too-fast": "Speaking too fast",
  monotone: "Flat, monotone voice",
  "flat-pace": "Always the same speed",
  "trailing-off": "Endings that fade",
  hedges: "Hedging (“I think”, “maybe”)",
  structure: "Unclear structure",
};

/**
 * What users said about themselves in the funnel ("symptoms") → the problem it points at.
 * Used for suggestions before we have any analysis.
 */
export const SYMPTOM_PROBLEM: Record<string, Problem> = {
  "too-fast": "too-fast",
  fillers: "fillers",
  "lose-thread": "structure",
  quiet: "trailing-off",
};

/**
 * Lessons that run entirely in the app, with no recording: confidence routines whose effect a
 * microphone can't measure (breathing, the "Yes!" ritual, body language tips). Progress for them
 * is kept in the browser.
 */
export type LocalLessonKind = "breathing" | "yes-button" | "body-tips";

export interface LocalLesson {
  slug: string;
  title: string;
  kind: LocalLessonKind;
}

export const CONFIDENCE_COURSE = {
  slug: "confidence",
  title: "Confidence before you speak",
  summary: "Quick routines for the minute before you speak: breathe, switch on, show up.",
  lessons: [
    { slug: "square-breathing", title: "Square breathing", kind: "breathing" },
    { slug: "yes-button", title: "Press the “Yes!” button", kind: "yes-button" },
    { slug: "body-language", title: "Look as confident as you are", kind: "body-tips" },
  ] satisfies LocalLesson[],
};

export function findLocalLesson(slug: string): LocalLesson | undefined {
  return CONFIDENCE_COURSE.lessons.find((l) => l.slug === slug);
}
