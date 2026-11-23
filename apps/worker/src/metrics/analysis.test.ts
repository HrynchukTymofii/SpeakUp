import type { TranscriptWord } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import type { AudioFeatures } from "../audio/features.js";
import { extractFeatures } from "../audio/features.js";
import { frameLevels, SAMPLE_RATE, yinPitch } from "../audio/signal.js";
import { synthSpeech } from "../testing/fakes.js";
import { computeMetrics } from "./index.js";
import { languageMetrics } from "./language.js";
import { normalizeWord } from "./normalize.js";
import { analyzePauses } from "./pauses.js";
import { punctuationMetrics, referenceTokens } from "./punctuation.js";
import { voiceMetrics } from "./voice.js";

/** "word@start-end" specs → transcript words (same helper style as metrics.test.ts). */
function words(...specs: string[]): TranscriptWord[] {
  return specs.map((spec) => {
    const [text = "", range = ""] = spec.split("@");
    const [start = "0", end = "0"] = range.split("-");
    return {
      word: normalizeWord(text),
      punctuated: text,
      start: Number(start),
      end: Number(end),
      confidence: 0.95,
    };
  });
}

/** Audio features with given silences and flat per-word values. */
function audioWith(
  ws: TranscriptWord[],
  silences: AudioFeatures["silences"],
  perWord: (i: number) => { db: number | null; pitchHz: number | null } = () => ({
    db: -20,
    pitchHz: 150,
  }),
): AudioFeatures {
  return { reliable: true, silences, words: ws.map((_, i) => perWord(i)) };
}

describe("signal", () => {
  it("YIN finds the pitch of a voiced tone", () => {
    const tone = new Float32Array(SAMPLE_RATE / 4);
    for (let n = 0; n < tone.length; n++) tone[n] = Math.sin((2 * Math.PI * 180 * n) / SAMPLE_RATE);
    expect(yinPitch(tone, 0)).toBeCloseTo(180, 0);
  });

  it("YIN returns null for noise-free silence", () => {
    expect(yinPitch(new Float32Array(SAMPLE_RATE / 4), 0)).toBeNull();
  });

  it("frame levels are ~−100 dB for silence and higher for sound", () => {
    const levels = frameLevels(synthSpeech(words("hi@0.1-0.5")));
    expect(Math.min(...levels)).toBeLessThan(-50);
    expect(Math.max(...levels)).toBeGreaterThan(-15);
  });
});

describe("extractFeatures", () => {
  it("finds a comma-length silence that STT timestamps would hide", () => {
    // The STT says the words touch (0.9 → 0.9); the audio has 0.25 s of silence inside.
    const stt = words("first,@0-0.9", "second@0.9-1.6", "third@1.7-2.2");
    const audioWords = words("first,@0-0.65", "second@0.9-1.6", "third@1.7-2.2");
    const features = extractFeatures(synthSpeech(audioWords), stt);
    expect(features.reliable).toBe(true);
    expect(features.silences).toHaveLength(1);
    expect(features.silences[0]?.start).toBeCloseTo(0.66, 1);
    // Per-word pitch is measured (synthSpeech gives word 0 → 120 Hz).
    expect(features.words[0]?.pitchHz).toBeCloseTo(120, -1);
  });

  it("is unreliable when speech is barely above the noise", () => {
    const ws = words("a@0-0.5", "b@0.6-1");
    const quiet = synthSpeech(ws, { amplitude: () => 0.002 });
    expect(extractFeatures(quiet, ws).reliable).toBe(false);
  });
});

describe("analyzePauses", () => {
  const ws = words("Hello,@0-0.5", "I@0.7-0.8", "um@1.2-1.4", "was@1.4-1.6", "thinking@2.3-2.8");

  it("uses audio silences and classifies boundary / hesitation / phrase", () => {
    const audio = audioWith(ws, [
      { start: 0.5, end: 0.7 }, // after "Hello," → boundary
      { start: 0.82, end: 1.15 }, // after "I", before "um" → hesitation (filler next)
      { start: 1.62, end: 2.25 }, // after "was", mid-phrase, 0.63 s → hesitation
    ]);
    const result = analyzePauses(ws, audio, new Set([2]));
    expect(result.source).toBe("audio");
    expect(result.list.map((p) => [p.afterWordIndex, p.kind])).toEqual([
      [0, "boundary"],
      [1, "hesitation"],
      [3, "hesitation"],
    ]);
  });

  it("merges two silences after the same word (split by a breath)", () => {
    const audio = audioWith(ws, [
      { start: 1.62, end: 1.8 },
      { start: 1.95, end: 2.25 },
    ]);
    const [pause] = analyzePauses(ws, audio, new Set()).list;
    expect(pause).toMatchObject({ afterWordIndex: 3, start: 1.62, durationSec: 0.63 });
  });

  it("falls back to STT gaps when the audio is missing or unreliable", () => {
    const unreliable = { ...audioWith(ws, []), reliable: false };
    const result = analyzePauses(ws, unreliable, new Set([2]));
    expect(result.source).toBe("transcript");
    expect(result.list.map((p) => p.afterWordIndex)).toEqual([0, 1, 3]); // gaps 0.2, 0.4, 0.7 s
  });

  it("measures the longest stretch of speech without a pause", () => {
    const result = analyzePauses(ws, audioWith(ws, [{ start: 0.82, end: 1.1 }]), new Set());
    expect(result.longestRunSec).toBe(1.7); // 1.1 → 2.8
  });
});

describe("punctuation (read-aloud)", () => {
  it("splits the reference into tokens with their marks", () => {
    expect(referenceTokens("Hi, I'm Tim. Well-known!")).toEqual([
      { token: "hi", mark: "," },
      { token: "i'm", mark: null },
      { token: "tim", mark: "." },
      { token: "well", mark: null },
      { token: "known", mark: "." },
    ]);
  });

  it("counts commas and sentence ends read with and without a pause", () => {
    const text = "We slow down, we pause, and we breathe. Then we continue.";
    const ws = words(
      "we@0-0.2",
      "slow@0.2-0.5",
      "down@0.5-0.8", // comma: 0.3 s pause → honored
      "we@1.1-1.2",
      "pause@1.2-1.5", // comma: no pause → skipped
      "and@1.5-1.6",
      "we@1.6-1.7",
      "breathe@1.7-2.0", // full stop: only 0.2 s → skipped (needs 0.3)
      "then@2.2-2.4",
      "we@2.4-2.5",
      "continue@2.5-3.0", // last mark: not judged
    );
    const pauses = analyzePauses(
      ws,
      audioWith(ws, [
        { start: 0.8, end: 1.1 },
        { start: 2.0, end: 2.2 },
      ]),
      new Set(),
    ).list;
    const p = punctuationMetrics(text, ws, new Set(), pauses);
    expect(p.commas).toEqual({ expected: 2, honored: 1 });
    expect(p.sentenceEnds).toEqual({ expected: 1, honored: 0 });
    expect(p.skipped.map((s) => [s.word, s.mark])).toEqual([
      ["pause", ","],
      ["breathe", "."],
    ]);
  });

  it("is only reported when pauses come from the audio", () => {
    const ws = words("a,@0-0.3", "b@0.35-0.6", "c@0.6-1");
    const m = computeMetrics({ words: ws, totalSec: 1, referenceText: "A, b c.", audio: null });
    expect(m.punctuation).toBeNull();
  });
});

describe("voiceMetrics", () => {
  const ws = Array.from({ length: 20 }, (_, i) => ({
    word: `w${i}`,
    punctuated: i % 5 === 4 ? `w${i}.` : `w${i}`,
    start: i * 0.4,
    end: i * 0.4 + 0.3,
    confidence: 0.95,
  }));

  it("a flat voice has ~0 pitch and loudness variation", () => {
    const v = voiceMetrics(ws, audioWith(ws, []), new Set(), []);
    expect(v.reliable).toBe(true);
    expect(v.pitchVariationSt).toBe(0);
    expect(v.loudnessVariationDb).toBe(0);
  });

  it("a lively voice varies in pitch (semitones) and loudness", () => {
    const audio = audioWith(ws, [], (i) => ({
      db: i % 2 ? -14 : -24,
      pitchHz: i % 2 ? 220 : 140,
    }));
    const v = voiceMetrics(ws, audio, new Set(), []);
    expect(v.pitchVariationSt).toBeGreaterThan(3);
    expect(v.loudnessVariationDb).toBeGreaterThan(4);
  });

  it("drops octave errors from the pitch track", () => {
    const audio = audioWith(ws, [], (i) => ({ db: -20, pitchHz: i === 3 ? 600 : 150 }));
    expect(voiceMetrics(ws, audio, new Set(), []).pitchVariationSt).toBe(0);
  });

  it("flags sentences whose last words fade", () => {
    // Sentences are 5 words (w0–w4.); in the first one the last two are 10 dB quieter.
    const audio = audioWith(ws, [], (i) => ({ db: i === 3 || i === 4 ? -30 : -20, pitchHz: 150 }));
    const v = voiceMetrics(ws, audio, new Set(), []);
    expect(v.trailingOff).toMatchObject({ count: 1, sentences: 4 });
    expect(v.trailingOff.list[0]).toEqual({ wordIndex: 4, dropDb: 10 });
  });

  it("keeps a timeline: one point per pitched word, relative to the speaker's median", () => {
    // w2 is a filler, w5 has no pitch, w7 is an octave error: none of them get a pitch point.
    const audio = audioWith(ws, [], (i) => ({
      db: i === 1 ? -14 : -20,
      pitchHz: i === 5 ? null : i === 7 ? 600 : i === 1 ? 250 : 150,
    }));
    const v = voiceMetrics(ws, audio, new Set([2]), []);
    expect(v.timeline?.pitch).toHaveLength(17);
    expect(v.timeline?.pitch[0]).toEqual({ t: 0.15, v: 0 });
    expect(v.timeline?.pitch[1]).toEqual({ t: 0.55, v: 8.8 }); // 250 Hz vs 150 Hz
    expect(v.timeline?.loudness).toHaveLength(19);
    expect(v.timeline?.loudness[1]).toEqual({ t: 0.55, v: 6 });
  });

  it("measures the volume range between the quiet and loud words", () => {
    const audio = audioWith(ws, [], (i) => ({ db: i % 2 ? -14 : -24, pitchHz: 150 }));
    expect(voiceMetrics(ws, audio, new Set(), []).loudnessRangeDb).toBe(10);
  });

  it("finds the most monotone stretch of an otherwise lively take", () => {
    // Lively until w5, then w6–w19 on one note (2.4 s → 7.9 s).
    const audio = audioWith(ws, [], (i) => ({
      db: -20,
      pitchHz: i < 6 ? (i % 2 ? 220 : 140) : 160,
    }));
    const v = voiceMetrics(ws, audio, new Set(), []);
    expect(v.flattest).toEqual({ start: 2.4, end: 7.9, pitchVariationSt: 0 });
  });

  it("reports no monotone stretch when the voice keeps moving", () => {
    const audio = audioWith(ws, [], (i) => ({ db: -20, pitchHz: i % 2 ? 220 : 140 }));
    expect(voiceMetrics(ws, audio, new Set(), []).flattest).toBeNull();
  });

  it("is not reliable with too few pitched words", () => {
    const audio = audioWith(ws, [], () => ({ db: -20, pitchHz: null }));
    expect(voiceMetrics(ws, audio, new Set(), []).reliable).toBe(false);
  });
});

describe("languageMetrics", () => {
  const say = (text: string) =>
    text.split(" ").map((w, i) => ({
      word: normalizeWord(w),
      punctuated: w,
      start: i * 0.3,
      end: i * 0.3 + 0.2,
      confidence: 0.9,
    }));

  it("finds repeated phrases, restarts and hedges", () => {
    const m = languageMetrics(
      say(
        "I want to build things. I I think I want to help people, kind of. What kind of job? I want to lead",
      ),
      new Set(),
    );
    expect(m.repeatedPhrases[0]).toEqual({ phrase: "i want to", count: 3 });
    expect(m.restarts.map((r) => r.phrase)).toEqual(["i i"]);
    // "kind of" after "what" is grammar, not a hedge.
    expect(m.hedges.list.map((h) => h.phrase)).toEqual(["i think", "kind of"]);
  });

  it("ignores phrases made only of very common words", () => {
    const m = languageMetrics(say("and it was fine and it was good"), new Set());
    expect(m.repeatedPhrases).toEqual([]);
  });

  it("skips fillers so they don't count twice", () => {
    const ws = say("basically we ship basically fast");
    expect(languageMetrics(ws, new Set([0, 3])).hedges.count).toBe(0);
  });
});
