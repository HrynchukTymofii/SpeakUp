import { LOW_CONFIDENCE, WPM_TARGET, type Metrics, type TranscriptWord } from "@speakup/shared";
import type { AudioFeatures } from "../audio/features.js";
import { detectFillers } from "./fillers.js";
import { languageMetrics } from "./language.js";
import { round, tokenize } from "./normalize.js";
import { analyzePauses } from "./pauses.js";
import { punctuationMetrics } from "./punctuation.js";
import { readAloudMetrics } from "./read-aloud.js";
import { voiceMetrics } from "./voice.js";

export interface MetricsInput {
  words: TranscriptWord[];
  /** Length of the whole recording in seconds (from the STT metadata). */
  totalSec: number;
  /** Set for read_aloud exercises → accuracy and punctuation are checked against it. */
  referenceText: string | null;
  /** Loudness/pitch/silences from the audio; null when decoding failed (transcript-only metrics). */
  audio: AudioFeatures | null;
}

/**
 * All speaking metrics, as pure functions of the transcript and the audio features (SPEC §6.3).
 * No I/O, no randomness → trivially unit-tested, and the LLM gets numbers we can defend.
 */
export function computeMetrics({ words, totalSec, referenceText, audio }: MetricsInput): Metrics {
  const first = words[0];
  const last = words.at(-1);
  const durationSec = first && last ? Math.max(0, last.end - first.start) : 0;

  const fillers = detectFillers(words);
  const fillerIndexes = new Set(fillers.flatMap((f) => f.indexes));
  const realWords = words.filter((_, i) => !fillerIndexes.has(i));

  // Below ~1 s of speech a rate is meaningless (and dividing by ~0 explodes).
  const minutes = durationSec / 60;
  const wpm = durationSec >= 1 ? realWords.length / minutes : 0;

  const pauses = analyzePauses(words, audio, fillerIndexes);
  const pauseList = pauses.list;

  return {
    durationSec: round(durationSec),
    totalSec: round(totalSec),
    wordCount: realWords.length,
    wpm: round(wpm, 0),
    wpmTarget: { ...WPM_TARGET },
    pauses: {
      count: pauseList.length,
      longCount: pauseList.filter((p) => p.long).length,
      longestSec: round(Math.max(0, ...pauseList.map((p) => p.durationSec))),
      list: pauseList,
      source: pauses.source,
      hesitationCount: pauseList.filter((p) => p.kind === "hesitation").length,
      longestRunSec: pauses.longestRunSec,
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
    // Comma pauses are only visible on the waveform; from STT gaps we'd report false misses.
    punctuation:
      referenceText !== null && pauses.source === "audio"
        ? punctuationMetrics(referenceText, words, fillerIndexes, pauseList)
        : null,
    voice: audio ? voiceMetrics(words, audio, fillerIndexes, pauseList) : null,
    language: referenceText === null ? languageMetrics(words, fillerIndexes) : null,
  };
}
