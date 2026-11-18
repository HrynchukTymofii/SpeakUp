import {
  HESITATION_PAUSE_SEC,
  LONG_PAUSE_SEC,
  PAUSE_MIN_SEC,
  type Pause,
  type TranscriptWord,
} from "@speakup/shared";
import type { AudioFeatures } from "../audio/features.js";
import { round } from "./normalize.js";

/** Punctuation that closes a thought or a clause — a pause there is the GOOD kind. */
const BOUNDARY = /[,.;:!?…—–]["'”’)]*$/;

export interface PauseAnalysis {
  list: Pause[];
  source: "audio" | "transcript";
  longestRunSec: number;
}

/**
 * Pauses between words, classified.
 *
 * Source: the waveform when we have a trustworthy one (real silence, down to 150 ms), else the
 * gaps between STT word timestamps. STT timestamps are smoothed — the engine often stretches a
 * word's end up to the next word's start — so from the transcript alone most comma-length
 * pauses are invisible. That's why audio is preferred.
 */
export function analyzePauses(
  words: TranscriptWord[],
  audio: AudioFeatures | null,
  fillerIndexes: Set<number>,
): PauseAnalysis {
  const useAudio = audio !== null && audio.reliable;
  const raw = useAudio ? pausesFromSilences(words, audio.silences) : pausesFromGaps(words);
  const list = raw.map((p) => ({ ...p, kind: classify(words, p, fillerIndexes) }));
  return {
    list,
    source: useAudio ? "audio" : "transcript",
    longestRunSec: longestRun(words, list),
  };
}

type RawPause = Omit<Pause, "kind">;

function makePause(start: number, durationSec: number, afterWordIndex: number): RawPause {
  return {
    start: round(start),
    durationSec: round(durationSec),
    afterWordIndex,
    long: durationSec > LONG_PAUSE_SEC,
  };
}

function pausesFromGaps(words: TranscriptWord[]): RawPause[] {
  const pauses: RawPause[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const cur = words[i];
    const next = words[i + 1];
    if (!cur || !next) continue;
    const gap = next.start - cur.end;
    if (gap >= PAUSE_MIN_SEC) pauses.push(makePause(cur.end, gap, i));
  }
  return pauses;
}

/**
 * Each silence belongs after the last word that STARTED before the silence's midpoint. (Word
 * ends are unreliable — see above — word starts are good.) Two silences after the same word
 * (e.g. split by a breath) become one pause spanning both.
 */
function pausesFromSilences(
  words: TranscriptWord[],
  silences: AudioFeatures["silences"],
): RawPause[] {
  const byWord = new Map<number, { start: number; end: number }>();
  let i = 0;
  for (const s of silences) {
    const mid = (s.start + s.end) / 2;
    while (i + 1 < words.length && (words[i + 1]?.start ?? Infinity) <= mid) i++;
    if (i >= words.length - 1) continue; // after the last word: not a pause
    const prev = byWord.get(i);
    byWord.set(i, prev ? { start: prev.start, end: s.end } : { ...s });
  }
  return [...byWord.entries()]
    .sort(([a], [b]) => a - b)
    .map(([idx, s]) => makePause(s.start, s.end - s.start, idx));
}

function classify(
  words: TranscriptWord[],
  p: RawPause,
  fillerIndexes: Set<number>,
): NonNullable<Pause["kind"]> {
  const i = p.afterWordIndex;
  // "I was, um, … working" — silence around a filler is searching for words.
  if (fillerIndexes.has(i) || fillerIndexes.has(i + 1)) return "hesitation";
  if (BOUNDARY.test(words[i]?.punctuated ?? "")) return "boundary";
  return p.durationSec >= HESITATION_PAUSE_SEC ? "hesitation" : "phrase";
}

/** Longest stretch of speech between two pauses (or the start/end of speaking). */
function longestRun(words: TranscriptWord[], pauses: Pause[]): number {
  const first = words[0];
  const last = words.at(-1);
  if (!first || !last) return 0;
  let longest = 0;
  let runStart = first.start;
  for (const p of pauses) {
    longest = Math.max(longest, p.start - runStart);
    runStart = p.start + p.durationSec;
  }
  return round(Math.max(longest, last.end - runStart), 1);
}
