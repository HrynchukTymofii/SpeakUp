import type { Tone } from "./catalog";

/**
 * Tailwind classes per pastel tone. Written out in full (not built with string templates) so
 * Tailwind's scanner sees every class. Pastel surfaces always carry dark ink.
 */
export const TONE_SURFACE: Record<Tone, string> = {
  peach: "bg-peach text-on-pastel",
  butter: "bg-butter text-on-pastel",
  sage: "bg-sage text-on-pastel",
  sky: "bg-sky text-on-pastel",
  lav: "bg-lav text-on-pastel",
  rose: "bg-rose text-on-pastel",
};

export const TONE_BORDER: Record<Tone, string> = {
  peach: "border-peach",
  butter: "border-butter",
  sage: "border-sage",
  sky: "border-sky",
  lav: "border-lav",
  rose: "border-rose",
};
