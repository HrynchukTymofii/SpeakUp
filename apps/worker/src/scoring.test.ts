import type { Metrics } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics/index.js";
import {
  computeSubscores,
  fillerScore,
  overallScore,
  paceScore,
  punctuationScore,
  voiceScore,
} from "./scoring.js";
import { makeWords } from "./testing/fakes.js";

const base: Metrics = computeMetrics({
  words: makeWords(40),
  totalSec: 17,
  referenceText: null,
  audio: null,
});

const withVoice = (voice: Partial<NonNullable<Metrics["voice"]>>): Metrics => ({
  ...base,
  voice: {
    reliable: true,
    pitchVariationSt: 2,
    pitchRangeSt: 5,
    loudnessVariationDb: 3,
    paceVariationPct: 15,
    trailingOff: { count: 0, sentences: 4, list: [] },
    ...voice,
  },
});

describe("subscores", () => {
  it("pace: full marks in the band, minus 1.2 per wpm outside", () => {
    expect(paceScore({ ...base, wpm: 145 })).toBe(100);
    expect(paceScore({ ...base, wpm: 185 })).toBe(70);
    expect(paceScore({ ...base, wpm: 30 })).toBe(20); // floor
  });

  it("fillers: 1 per minute is free, then 10 points each", () => {
    expect(fillerScore({ ...base, fillers: { ...base.fillers, perMinute: 1 } })).toBe(100);
    expect(fillerScore({ ...base, fillers: { ...base.fillers, perMinute: 6 } })).toBe(50);
  });

  it("punctuation: share of honored marks, sentence ends count double", () => {
    const m: Metrics = {
      ...base,
      punctuation: {
        commas: { expected: 4, honored: 2 },
        sentenceEnds: { expected: 3, honored: 3 },
        skipped: [],
      },
    };
    expect(punctuationScore(m)).toBe(80); // (2 + 6) / (4 + 6)
  });

  it("voice: a monotone delivery scores low, a lively one high", () => {
    const flat = voiceScore(
      withVoice({ pitchVariationSt: 0.8, loudnessVariationDb: 1.5, paceVariationPct: 5 }),
    );
    const lively = voiceScore(
      withVoice({ pitchVariationSt: 3.5, loudnessVariationDb: 6, paceVariationPct: 30 }),
    );
    expect(flat).toBeLessThan(40);
    expect(lively).toBe(100);
  });

  it("voice: no score when the audio isn't reliable", () => {
    expect(voiceScore(withVoice({ reliable: false }))).toBeNull();
    expect(voiceScore(base)).toBeNull();
  });
});

describe("overallScore", () => {
  it("is the weighted mean of the skills we have", () => {
    expect(
      overallScore({ content: 60, voice: 50, pauses: 80, fillers: 100, pace: 100 }, "free_speech"),
    ).toBe(
      74, // .3·60 + .2·50 + .2·80 + .15·100 + .15·100
    );
  });

  it("renormalizes the weights when a skill is missing", () => {
    expect(overallScore({ pace: 100, fillers: 50 }, "free_speech")).toBe(75);
  });

  it("a perfect read with a flat voice and skipped commas is far from 95", () => {
    const m: Metrics = {
      ...withVoice({ pitchVariationSt: 1, loudnessVariationDb: 2, paceVariationPct: 6 }),
      wpm: 150,
      readAloud: {
        accuracyPct: 100,
        referenceWordCount: 40,
        missed: [],
        substituted: [],
        inserted: [],
      },
      punctuation: {
        commas: { expected: 6, honored: 2 },
        sentenceEnds: { expected: 4, honored: 3 },
        skipped: [],
      },
    };
    const score = overallScore(computeSubscores(m, "read_aloud"), "read_aloud");
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(75);
  });
});
