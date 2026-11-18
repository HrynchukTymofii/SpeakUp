import type { TranscriptWord } from "@speakup/shared";

/**
 * Sounds that are ALWAYS fillers. Deepgram (with `filler_words=true`) writes them with these
 * exact spellings (uh, um, mhmm…); "erm"/"er"/"ah"/"hmm" cover other engines and accents.
 */
const PURE_FILLERS = new Set(["um", "uh", "erm", "er", "ah", "hmm", "mm", "mhmm", "uhm"]);

/**
 * Words that are fillers only in some contexts: "I like tea" vs "it was, like, huge".
 * Without a grammar model we stay conservative (SPEC §6.3): count them only when they are
 * isolated by short silences on BOTH sides, which is how they sound when used as filler.
 * Missing a few fillers is better than telling someone they said "like" 10 times when they didn't.
 */
const CONTEXT_FILLERS = new Set(["like", "so", "basically", "actually"]);
const ISOLATION_GAP_SEC = 0.3;

export interface FillerHit {
  word: string;
  start: number;
  /** Index of the (first) word in the transcript. "you know" is one hit covering two words. */
  wordIndex: number;
  /** All word indexes that belong to this filler (excluded from the word count). */
  indexes: number[];
}

function gapBefore(words: TranscriptWord[], i: number): number {
  const prev = words[i - 1];
  const cur = words[i];
  if (!cur) return 0;
  return prev ? cur.start - prev.end : Infinity; // start of recording counts as a pause
}

function gapAfter(words: TranscriptWord[], i: number): number {
  const cur = words[i];
  const next = words[i + 1];
  if (!cur) return 0;
  return next ? next.start - cur.end : Infinity;
}

export function detectFillers(words: TranscriptWord[]): FillerHit[] {
  const hits: FillerHit[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;

    if (PURE_FILLERS.has(w.word)) {
      hits.push({ word: w.word, start: w.start, wordIndex: i, indexes: [i] });
      continue;
    }

    // "you know" as a filler: followed by a pause or a comma ("…, you know, …").
    const next = words[i + 1];
    if (w.word === "you" && next?.word === "know") {
      const pauseAfter = gapAfter(words, i + 1) >= ISOLATION_GAP_SEC || /,$/.test(next.punctuated);
      if (pauseAfter && gapBefore(words, i) >= ISOLATION_GAP_SEC) {
        hits.push({ word: "you know", start: w.start, wordIndex: i, indexes: [i, i + 1] });
        i++; // skip "know"
        continue;
      }
    }

    if (
      CONTEXT_FILLERS.has(w.word) &&
      gapBefore(words, i) >= ISOLATION_GAP_SEC &&
      gapAfter(words, i) >= ISOLATION_GAP_SEC
    ) {
      hits.push({ word: w.word, start: w.start, wordIndex: i, indexes: [i] });
    }
  }
  return hits;
}
