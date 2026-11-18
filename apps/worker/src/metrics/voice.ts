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
  const pitches = content.flatMap(({ f }) => (f?.pitchHz ? [f.pitchHz] : []));
  const center = median(pitches);
  const semitones = pitches
    .map((hz) => 12 * Math.log2(hz / center))
    .filter((st) => Math.abs(st) < OCTAVE_ST);

  const dbs = content.flatMap(({ f }) => (f?.db !== null && f?.db !== undefined ? [f.db] : []));

  return {
    reliable: audio.reliable && semitones.length >= MIN_PITCHED_WORDS,
    pitchVariationSt: round(stdDev(semitones), 1),
    pitchRangeSt: round(
      semitones.length > 0 ? percentile(semitones, 0.9) - percentile(semitones, 0.1) : 0,
      1,
    ),
    loudnessVariationDb: round(stdDev(dbs), 1),
    paceVariationPct: paceVariation(words, fillerIndexes, pauses),
    trailingOff: trailingOff(words, audio, fillerIndexes),
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
