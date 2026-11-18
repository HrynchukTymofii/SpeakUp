/**
 * Text normalization shared by filler detection and read-aloud alignment.
 * Both the reference text and the STT words go through the SAME function, so differences in
 * case, punctuation or quote style never count as reading mistakes.
 */

/** "Pace," → "pace", "Don’t" → "don't", "—" → "" */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’‘`]/g, "'") // curly apostrophes → straight
    .replace(/[^a-z0-9'-]/g, "") // drop punctuation, keep in-word apostrophes/hyphens
    .replace(/^['-]+|['-]+$/g, ""); // …but not leading/trailing ones
}

/**
 * Splits text into normalized word tokens. Hyphenated words become separate tokens
 * ("well-known" → "well", "known") because STT engines are inconsistent about hyphens.
 */
export function tokenize(text: string): string[] {
  return text
    .split(/[\s–—-]+/) // whitespace, en/em dashes and hyphens
    .map(normalizeWord)
    .filter((token) => token.length > 0);
}

export const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
