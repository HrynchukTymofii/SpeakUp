import { PRACTICE_MODES, type PracticeMode } from "@speakup/shared";

/** The Practice tab's mode cards. One line each: nobody reads more on a card. */
export const MODE_INFO: Record<PracticeMode, { label: string; icon: string; short: string }> = {
  topic: { label: "One-minute topic", icon: "⏱️", short: "Talk for 60 seconds, no prep" },
  questions: { label: "Question storm", icon: "❓", short: "Ask as many questions as you can" },
  convince: { label: "Convince me", icon: "🔥", short: "Make a silly idea matter" },
  twister: { label: "Tongue twister", icon: "👅", short: "Clear words, then faster" },
};

export function parseMode(value: string): PracticeMode | undefined {
  return PRACTICE_MODES.find((mode) => mode === value);
}

/**
 * Speak like a legend: watch the opening of a famous talk, then repeat it. Videos are the
 * official uploads (Stanford, TED, Y Combinator), embedded — we host no copies or transcripts.
 * `slug` = the seeded exercise.
 */
export const LEGENDS = [
  {
    slug: "legend-jobs-stanford",
    speaker: "Steve Jobs",
    talk: "Stanford, 2005",
    youtubeId: "UF8uR6Z6KLc",
    copy: "Short sentences, calm pace, real pauses",
  },
  {
    slug: "legend-sinek-why",
    speaker: "Simon Sinek",
    talk: "Start with why · TED",
    youtubeId: "qp0HIF3SfI4",
    copy: "Open with a question, slow down on the big idea",
  },
  {
    slug: "legend-hale-pitch",
    speaker: "Kevin Hale",
    talk: "How to pitch · Y Combinator",
    youtubeId: "17XZGUX_9iM",
    copy: "One clear sentence: what it is, who it’s for",
  },
  {
    slug: "legend-brown-story",
    speaker: "Brené Brown",
    talk: "Vulnerability · TED",
    youtubeId: "iCvmsMzlF7o",
    copy: "An honest, funny story that leads to the point",
  },
] as const;

/**
 * Where "Continue" on the results page goes. Only in-app paths: the value comes from the URL,
 * so anything else (other sites, `//host`, `/\host`) would be an open redirect.
 */
export function safeNextPath(raw: string | null | undefined): string | undefined {
  if (!raw || !/^\/app(\/|\?|$)/.test(raw)) return undefined;
  if (raw.startsWith("//") || raw.includes("\\")) return undefined;
  return raw;
}

/** The results page of an attempt, with the way back to where the user recorded it. */
export function resultsHref(attemptId: string, next?: string): string {
  const base = `/results/${attemptId}`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}
