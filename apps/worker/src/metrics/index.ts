import {
  LONG_PAUSE_SEC,
  LOW_CONFIDENCE,
  PAUSE_MIN_SEC,
  WPM_TARGET,
  type Metrics,
  type Pause,
  type TranscriptWord,
} from "@speakup/shared";
import { detectFillers } from "./fillers.js";
import { round, tokenize } from "./normalize.js";
import { readAloudMetrics } from "./read-aloud.js";

export interface MetricsInput {
  words: TranscriptWord[];
  /** Length of the whole recording in seconds (from the STT metadata). */
  totalSec: number;
  /** Set for read_aloud exercises → accuracy is computed against it. */
  referenceText: string | null;
}

/**
 * All speaking metrics, as pure functions of the transcript (SPEC §6.3).
 * No I/O, no randomness → trivially unit-tested, and the LLM gets numbers we can defend.
 */
export function computeMetrics({ words, totalSec, referenceText }: MetricsInput): Metrics {
  const first = words[0];
  const last = words.at(-1);
  const durationSec = first && last ? Math.max(0, last.end - first.start) : 0;

  const fillers = detectFillers(words);
  const fillerIndexes = new Set(fillers.flatMap((f) => f.indexes));
  const realWords = words.filter((_, i) => !fillerIndexes.has(i));

  // Below ~1 s of speech a rate is meaningless (and dividing by ~0 explodes).
  const minutes = durationSec / 60;
  const wpm = durationSec >= 1 ? realWords.length / minutes : 0;

  const pauses = findPauses(words);

  return {
    durationSec: round(durationSec),
    totalSec: round(totalSec),
    wordCount: realWords.length,
    wpm: round(wpm, 0),
    wpmTarget: { ...WPM_TARGET },
    pauses: {
      count: pauses.length,
      longCount: pauses.filter((p) => p.long).length,
      longestSec: round(Math.max(0, ...pauses.map((p) => p.durationSec))),
      list: pauses,
    },
    fillers: {
      count: fillers.length,
      perMinute: durationSec >= 1 ? round(fillers.length / minutes, 1) : 0,
      list: fillers.map(({ word, start, wordIndex }) => ({ word, start: round(start), wordIndex })),
    },
    lowConfidenceWords: words.flatMap((w, wordIndex) =>
      !fillerIndexes.has(wordIndex) && w.confidence < LOW_CONFIDENCE
        ? [
            {
              word: w.punctuated,
              start: round(w.start),
              confidence: round(w.confidence),
              wordIndex,
            },
          ]
        : [],
    ),
    readAloud:
      referenceText === null
        ? null
        : // Fillers aren't reading mistakes; leave them out of the comparison.
          readAloudMetrics(
            tokenize(referenceText),
            realWords.flatMap((w) => tokenize(w.word)),
          ),
  };
}

/** Silences between consecutive words longer than PAUSE_MIN_SEC. */
export function findPauses(words: TranscriptWord[]): Pause[] {
  const pauses: Pause[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const cur = words[i];
    const next = words[i + 1];
    if (!cur || !next) continue;
    const gap = next.start - cur.end;
    if (gap > PAUSE_MIN_SEC) {
      pauses.push({
        start: round(cur.end),
        durationSec: round(gap),
        afterWordIndex: i,
        long: gap > LONG_PAUSE_SEC,
      });
    }
  }
  return pauses;
}
