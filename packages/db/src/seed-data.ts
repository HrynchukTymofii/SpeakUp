/**
 * Seed content (SPEC §5): 1 course, 3 lessons (Lesson 1 free), 1–2 exercises each,
 * plus the standalone `baseline` read-aloud exercise used by the web funnel.
 *
 * Plain data, no DB access — so it can be unit-tested (seed-data.test.ts) and reviewed
 * like copy. MVP has no admin CMS; content changes = edit this file + `pnpm db:seed`.
 */

type ExerciseType = "read_aloud" | "free_speech";

export interface SeedExercise {
  slug: string;
  type: ExerciseType;
  prompt: string;
  referenceText?: string; // required for read_aloud
  maxDurationSec: number;
  order: number;
}

export interface SeedLesson {
  slug: string;
  title: string;
  order: number;
  isFree: boolean;
  body: string; // markdown
  exercises: SeedExercise[];
}

export interface SeedCourse {
  slug: string;
  title: string;
  summary: string;
  order: number;
  lessons: SeedLesson[];
}

/** Baseline: ~70 words, max 45 s (the funnel's anonymous-recording cap, SPEC §9). */
export const baselineExercise: SeedExercise = {
  slug: "baseline",
  type: "read_aloud",
  prompt: "Read this paragraph out loud at your natural pace.",
  referenceText:
    "Good communication is a skill, not a talent. When we speak clearly, we slow down, " +
    "we pause between ideas, and we choose simple words. Our listeners stay with us because " +
    "they never have to guess what we mean. Today I am reading this short paragraph out loud, " +
    "so I can hear my own voice. Next week, I will read it again and notice how much my " +
    "speaking has changed.",
  maxDurationSec: 45,
  order: 0,
};

export const course: SeedCourse = {
  slug: "speak-with-confidence",
  title: "Speak with Confidence",
  summary:
    "Short daily lessons on pace, pauses and filler words — the habits that make speech easy to follow.",
  order: 1,
  lessons: [
    {
      slug: "find-your-pace",
      title: "Find your pace",
      order: 1,
      isFree: true,
      body: [
        "## Why pace matters",
        "",
        "When we're nervous we speed up. Fast speech is harder to follow and sounds less confident.",
        "For conversational English, a comfortable range is roughly **130–160 words per minute**.",
        "",
        "## Try this",
        "",
        "- Breathe out before your first word.",
        "- Finish each sentence fully before starting the next.",
        "- Slightly stretch the important words.",
      ].join("\n"),
      exercises: [
        {
          slug: "find-your-pace-read",
          type: "read_aloud",
          prompt: "Read this out loud. Aim for a calm, steady pace.",
          referenceText:
            "Thank you all for joining today. I want to share three quick updates. First, the " +
            "project is on schedule. Second, we found a simpler way to test our ideas with real " +
            "customers. Third, we need two volunteers to help with next week's demo. I will " +
            "explain each point, and then we can take your questions.",
          maxDurationSec: 60,
          order: 1,
        },
        {
          slug: "find-your-pace-intro",
          type: "free_speech",
          prompt:
            "Introduce yourself as if you were at the start of a job interview. Keep it to about 45 seconds.",
          maxDurationSec: 60,
          order: 2,
        },
      ],
    },
    {
      slug: "power-of-the-pause",
      title: "The power of the pause",
      order: 2,
      isFree: false,
      body: [
        "## Pauses are not mistakes",
        "",
        "A short pause gives listeners time to absorb what you said — and gives you time to think.",
        "Pauses of about half a second between ideas sound natural. Very long, unplanned pauses",
        "(over 1.5 seconds) can sound like you've lost your train of thought.",
        "",
        "## Try this",
        "",
        "- Pause at every full stop.",
        "- Pause *before* an important point, not after it.",
        "- Replace “um” with silence.",
      ].join("\n"),
      exercises: [
        {
          slug: "power-of-the-pause-read",
          type: "read_aloud",
          prompt: "Read this out loud. Take a clear pause at each full stop.",
          referenceText:
            "Here is the problem. Our customers love the product, but many of them never finish " +
            "setting it up. Why does that happen? Because the first step asks for too much. So " +
            "here is my proposal. We cut the first step in half, and we measure what changes.",
          maxDurationSec: 60,
          order: 1,
        },
      ],
    },
    {
      slug: "cut-the-filler",
      title: "Cut the filler words",
      order: 3,
      isFree: false,
      body: [
        "## Where fillers come from",
        "",
        "Words like “um”, “uh”, “like” and “you know” fill silence while we think.",
        "A few are normal. Many make a speaker sound unsure, even when they know the topic well.",
        "",
        "## Try this",
        "",
        "- Notice your most common filler — awareness alone reduces it.",
        "- When you feel a filler coming, close your mouth and pause instead.",
        "- Plan your first and last sentence; the middle gets easier.",
      ].join("\n"),
      exercises: [
        {
          slug: "cut-the-filler-explain",
          type: "free_speech",
          prompt:
            "Explain what you do at work (or study) to a friend who knows nothing about it. About 60 seconds.",
          maxDurationSec: 75,
          order: 1,
        },
        {
          slug: "cut-the-filler-opinion",
          type: "free_speech",
          prompt:
            "Give your opinion on this question and one reason for it: is it better to work from home or from an office? About 45 seconds.",
          maxDurationSec: 60,
          order: 2,
        },
      ],
    },
  ],
};
