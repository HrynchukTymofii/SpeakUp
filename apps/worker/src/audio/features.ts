import { PAUSE_MIN_SEC, type TranscriptWord } from "@speakup/shared";
import {
  frameLevels,
  frameTime,
  HOP,
  median,
  percentile,
  SAMPLE_RATE,
  yinPitch,
} from "./signal.js";

/** What the audio adds to the transcript: real silences and per-word loudness/pitch. */
export interface AudioFeatures {
  /**
   * False when speech is barely louder than the background (noisy room, bad mic). Then the
   * silences and loudness numbers can't be trusted and metrics fall back to the transcript.
   */
  reliable: boolean;
  /** Silences ≥ PAUSE_MIN_SEC between the first and the last word, in seconds. */
  silences: { start: number; end: number }[];
  /** One entry per transcript word (same order). null = no usable frames inside the word. */
  words: { db: number | null; pitchHz: number | null }[];
}

/** Speech must be at least this much louder than the background to measure anything. */
const MIN_DYNAMIC_RANGE_DB = 15;
/** A frame is silent below floor + this share of (speech level − floor)… */
const SILENCE_SHARE = 0.3;
/**
 * …or below speech level − this. Needed when the background is digitally silent (noise
 * suppression, synthetic audio): the floor sits at −100 dB, and floor + 30 % of the range would
 * be so low that the quiet-but-not-zero gap at a comma never counts as silence.
 */
const SILENCE_BELOW_SPEECH_DB = 35;
/** Pitch every 2nd frame (20 ms) — plenty for intonation, half the CPU. */
const PITCH_EVERY = 2;

/**
 * Measures the recording against its own transcript.
 *
 * Silence threshold is ADAPTIVE: noise floor = 10th percentile of frame levels (the quiet
 * parts), speech level = 95th percentile. Fixed dB thresholds break across microphones; this
 * works whether the recording is loud or quiet, noisy or noise-suppressed.
 */
export function extractFeatures(samples: Float32Array, words: TranscriptWord[]): AudioFeatures {
  const levels = frameLevels(samples);
  const first = words[0];
  const last = words.at(-1);
  if (levels.length === 0 || !first || !last) {
    return { reliable: false, silences: [], words: words.map(() => ({ db: null, pitchHz: null })) };
  }

  const floor = percentile(levels, 0.1);
  const speech = percentile(levels, 0.95);
  const reliable = speech - floor >= MIN_DYNAMIC_RANGE_DB;
  const threshold = Math.max(
    floor + SILENCE_SHARE * (speech - floor),
    speech - SILENCE_BELOW_SPEECH_DB,
  );

  // Silences: runs of quiet frames, only between the first and the last word (lead-in and
  // trailing silence aren't pauses).
  const silences: AudioFeatures["silences"] = [];
  let runStart: number | null = null;
  for (let k = 0; k <= levels.length; k++) {
    const quiet = k < levels.length && (levels[k] ?? 0) < threshold;
    if (quiet && runStart === null) runStart = k;
    if (!quiet && runStart !== null) {
      const start = frameTime(runStart);
      const end = frameTime(k - 1);
      if (end - start >= PAUSE_MIN_SEC && start > first.start && end < last.end) {
        silences.push({ start, end });
      }
      runStart = null;
    }
  }

  // Per word: mean level of its voiced frames, median pitch.
  const frameOf = (t: number) => Math.max(0, Math.round((t * SAMPLE_RATE) / HOP));
  const wordFeatures = words.map((w) => {
    const dbs: number[] = [];
    const pitches: number[] = [];
    const end = Math.min(levels.length - 1, frameOf(w.end));
    for (let k = frameOf(w.start); k <= end; k++) {
      const level = levels[k] ?? -100;
      if (level < threshold) continue;
      dbs.push(level);
      if (k % PITCH_EVERY === 0) {
        const f0 = yinPitch(samples, k * HOP);
        if (f0 !== null) pitches.push(f0);
      }
    }
    return {
      db: dbs.length > 0 ? dbs.reduce((a, b) => a + b, 0) / dbs.length : null,
      // Needs a few voiced frames, or one octave error decides the word's pitch.
      pitchHz: pitches.length >= 3 ? median(pitches) : null,
    };
  });

  return { reliable, silences, words: wordFeatures };
}
