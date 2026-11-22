import type { Tone } from "./catalog";

/**
 * Tailwind classes per pastel tone. Written out in full (not built with string templates) so
 * Tailwind's scanner sees every class. Pastel surfaces always carry dark ink.
 * Glow keeps colour to a minimum: every tile shares the lavender wash and the emoji tells
 * courses apart. The tones stay in the catalog in case a screen needs them again.
 */
export const TONE_SURFACE: Record<Tone, string> = {
  peach: "bg-lav text-on-pastel",
  butter: "bg-lav text-on-pastel",
  sage: "bg-lav text-on-pastel",
  sky: "bg-lav text-on-pastel",
  lav: "bg-lav text-on-pastel",
  rose: "bg-lav text-on-pastel",
};

export const TONE_BORDER: Record<Tone, string> = {
  peach: "border-peach",
  butter: "border-butter",
  sage: "border-sage",
  sky: "border-sky",
  lav: "border-lav",
  rose: "border-rose",
};
