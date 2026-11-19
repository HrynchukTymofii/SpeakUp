import type { Exercise } from "@speakup/shared";
import type { Tone } from "./catalog";

/** The quick-drill families of the Practice feed (slug prefix `drill-<kind>-`). */
export type DrillKind = "topic" | "questions" | "convince" | "twister";

export const DRILL_INFO: Record<
  DrillKind,
  { label: string; tone: Tone; icon: string; why: string }
> = {
  topic: {
    label: "One-minute topic",
    tone: "peach",
    icon: "⏱️",
    why: "Trains speaking without a script: start, keep going, land it.",
  },
  questions: {
    label: "Question storm",
    tone: "sky",
    icon: "❓",
    why: "Curiosity on demand — the fuel of every good conversation and Q&A.",
  },
  convince: {
    label: "Convince me",
    tone: "butter",
    icon: "🔥",
    why: "If you can make this sound important, you can sell anything.",
  },
  twister: {
    label: "Tongue twister",
    tone: "lav",
    icon: "👅",
    why: "Wakes up lips and tongue for clear, crisp words.",
  },
};

export function drillKind(slug: string): DrillKind | null {
  const match = /^drill-(topic|questions|convince|twister)-/.exec(slug);
  return match ? (match[1] as DrillKind) : null;
}

/** Small deterministic PRNG (mulberry32) from a string seed. */
function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The feed: quick drills only (legends and challenges live on the Challenges tab), shuffled
 * with a seed — the day — so the order is fresh every day but doesn't jump while scrolling.
 */
export function feedExercises(exercises: Exercise[], seed: string, kind?: DrillKind): Exercise[] {
  const drills = exercises.filter((e) => {
    const k = drillKind(e.slug);
    return k !== null && (!kind || k === kind);
  });
  const random = seededRandom(seed);
  const shuffled = [...drills];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * "Speak like a legend — John F. Kennedy, 1961. Build up…" → "John F. Kennedy, 1961".
 * Cut at the year, not at the first period (initials have periods).
 */
export function legendTitle(prompt: string): string {
  return /—\s*(.+?,\s*\d{4})/.exec(prompt)?.[1] ?? prompt;
}
