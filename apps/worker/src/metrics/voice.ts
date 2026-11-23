import { VOICE_TARGETS, type Pause, type TranscriptWord, type VoiceMetrics } from "@speakup/shared";
import type { AudioFeatures } from "../audio/features.js";
import { median, percentile, stdDev } from "../audio/signal.js";
import { round } from "./normalize.js";

/** Fewer pitched words than this → too little to judge intonation. */
const MIN_PITCHED_WORDS = 8;
/** Per-word pitch further than an octave from the speaker's median is a tracking error. */
const OCTAVE_ST = 12;
const MIN_PHRASE_WORDS = 4;
const MIN_PHRASE_SEC = 1;
const SENTENCE_END = /[.!?…]["'”’)]*$/;

/**
 * How the speaker uses their voice: intonation, emphasis, pace changes, trailing off.
 * Everything is relative to the speaker's own median (semitones, dB differences), so a deep
 * voice or a quiet microphone isn't "worse".
 */
export function voiceMetrics(
  words: TranscriptWord[],
  audio: AudioFeatures,
  fillerIndexes: Set<number>,
  pauses: Pause[],
): VoiceMetrics {
  const content = words
    .map((w, i) => ({ w, i, f: audio.words[i] }))
    .filter(({ i, f }) => !fillerIndexes.has(i) && f !== undefined);

  // Intonation in semitones relative to the speaker's median pitch.
  const center = median(content.flatMap(({ f }) => (f?.pitchHz ? [f.pitchHz] : [])));
  const pitched = content
    .flatMap(({ w, f }) => (f?.pitchHz ? [{ w, st: 12 * Math.log2(f.pitchHz / center) }] : []))
    .filter(({ st }) => Math.abs(st) < OCTAVE_ST);
  const semitones = pitched.map((p) => p.st);

  const loud = content.flatMap(({ w, f }) =>
    f?.db !== null && f?.db !== undefined ? [{ w, db: f.db }] : [],
  );
  const dbs = loud.map((l) => l.db);
  const dbCenter = median(dbs);
  const mid = (w: TranscriptWord) => round((w.start + w.end) / 2, 2);

  return {
    reliable: audio.reliable && semitones.length >= MIN_PITCHED_WORDS,
    pitchVariationSt: round(stdDev(semitones), 1),
    pitchRangeSt: round(spread(semitones), 1),
    loudnessVariationDb: round(stdDev(dbs), 1),
    paceVariationPct: paceVariation(words, fillerIndexes, pauses),
    trailingOff: trailingOff(words, audio, fillerIndexes),
    loudnessRangeDb: round(spread(dbs), 1),
    timeline: {
      pitch: pitched.map(({ w, st }) => ({ t: mid(w), v: round(st, 1) })),
      loudness: loud.map(({ w, db }) => ({ t: mid(w), v: round(db - dbCenter, 1) })),
    },
    flattest: pitched.length >= MIN_PITCHED_WORDS ? flattestStretch(pitched) : null,
  };
}

/** Span between the 10th and 90th percentile: the range without the odd outlier. */
const spread = (xs: number[]) => (xs.length > 0 ? percentile(xs, 0.9) - percentile(xs, 0.1) : 0);

/** Windows this close to the flattest one count as part of the same monotone stretch. */
const STRETCH_TOLERANCE_ST = 0.25;

/**
 * The most monotone part of the take, so the report can point at a moment, not just a number.
 * Every window of at least stretchMinSec and stretchMinWords is scored by its pitch variation;
 * the flattest window, merged with the overlapping windows that are nearly as flat, is the
 * stretch. null when even the flattest window has normal variety.
 */
function flattestStretch(pitched: { w: TranscriptWord; st: number }[]): VoiceMetrics["flattest"] {
  const { stretchMinSec, stretchMinWords, monotoneSt } = VOICE_TARGETS;
  const windows: { from: number; to: number; sd: number }[] = [];
  for (let from = 0; from < pitched.length; from++) {
    const startSec = pitched[from]?.w.start ?? 0;
    let to = from + stretchMinWords - 1;
    while (to < pitched.length && (pitched[to]?.w.end ?? 0) - startSec < stretchMinSec) to++;
    if (to >= pitched.length) break;
    windows.push({ from, to, sd: stdDev(pitched.slice(from, to + 1).map((p) => p.st)) });
  }
  let best = windows[0];
  for (const w of windows) if (best && w.sd < best.sd) best = w;
  if (!best || best.sd >= monotoneSt) return null;

  // Windows are ordered by start, so one pass grows the stretch over touching flat windows.
  let { from, to } = best;
  for (const w of windows) {
    if (w.sd > best.sd + STRETCH_TOLERANCE_ST) continue;
    if (w.from <= to && w.to >= from) {
      from = Math.min(from, w.from);
      to = Math.max(to, w.to);
    }
  }
  const stretch = pitched.slice(from, to + 1);
  return {
    start: round(stretch[0]?.w.start ?? 0, 2),
    end: round(stretch.at(-1)?.w.end ?? 0, 2),
    pitchVariationSt: round(stdDev(stretch.map((p) => p.st)), 1),
  };
}

/** Speaking rate per phrase (speech between two pauses); how much it varies. */
function paceVariation(
  words: TranscriptWord[],
  fillerIndexes: Set<number>,
  pauses: Pause[],
): number | null {
  const breaks = new Set(pauses.map((p) => p.afterWordIndex));
  const rates: number[] = [];
  let startIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (!breaks.has(i) && i !== words.length - 1) continue;
    const phrase = words.slice(startIdx, i + 1).filter((_, k) => !fillerIndexes.has(startIdx + k));
    const first = phrase[0];
    const last = phrase.at(-1);
    if (first && last && phrase.length >= MIN_PHRASE_WORDS) {
      const sec = last.end - first.start;
      if (sec >= MIN_PHRASE_SEC) rates.push(phrase.length / sec);
    }
    startIdx = i + 1;
  }
  if (rates.length < 3) return null;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return round((stdDev(rates) / mean) * 100, 0);
}

/** Sentences whose last two words are much quieter than the sentence's typical word. */
function trailingOff(
  words: TranscriptWord[],
  audio: AudioFeatures,
  fillerIndexes: Set<number>,
): VoiceMetrics["trailingOff"] {
  const list: VoiceMetrics["trailingOff"]["list"] = [];
  let sentences = 0;
  let sentence: { i: number; db: number }[] = [];
  words.forEach((w, i) => {
    const db = audio.words[i]?.db;
    if (!fillerIndexes.has(i) && db !== null && db !== undefined) sentence.push({ i, db });
    const isEnd = SENTENCE_END.test(w.punctuated) || i === words.length - 1;
    if (!isEnd) return;
    if (sentence.length >= 5) {
      sentences++;
      const body = median(sentence.slice(0, -2).map((s) => s.db));
      const tail = sentence.slice(-2).reduce((a, s) => a + s.db, 0) / 2;
      const drop = body - tail;
      const lastWord = sentence.at(-1);
      if (drop >= VOICE_TARGETS.trailingDropDb && lastWord) {
        list.push({ wordIndex: lastWord.i, dropDb: round(drop, 1) });
      }
    }
    sentence = [];
  });
  return { count: list.length, sentences, list };
}
