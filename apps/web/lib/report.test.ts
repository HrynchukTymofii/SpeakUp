import type { Feedback, Metrics } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import {
  hesitationSummary,
  orderedSubscores,
  punctuationSummary,
  scoreSurface,
  voiceVerdict,
} from "./report";

const metrics: Metrics = {
  durationSec: 30,
  totalSec: 32,
  wordCount: 70,
  wpm: 140,
  wpmTarget: { min: 130, max: 160 },
  pauses: { count: 5, longCount: 1, longestSec: 1.8, list: [] },
  fillers: { count: 2, perMinute: 4, list: [] },
  lowConfidenceWords: [],
  readAloud: null,
};

const voice = (pitchVariationSt: number, reliable = true): Metrics => ({
  ...metrics,
  voice: {
    reliable,
    pitchVariationSt,
    pitchRangeSt: 4,
    loudnessVariationDb: 3,
    paceVariationPct: 12,
    trailingOff: { count: 2, sentences: 5, list: [] },
  },
});

describe("report helpers", () => {
  it("voice verdict follows the pitch variation, and mentions fading sentences", () => {
    expect(voiceVerdict(voice(1))?.label).toBe("Monotone");
    expect(voiceVerdict(voice(2.2))?.label).toBe("Some variety");
    expect(voiceVerdict(voice(3.4))).toEqual({
      label: "Lively",
      detail: "pitch moves ±3.4 semitones · 2 of 5 sentences fade out",
    });
  });

  it("no voice verdict without a reliable voice analysis (old or noisy recordings)", () => {
    expect(voiceVerdict(metrics)).toBeNull();
    expect(voiceVerdict(voice(3, false))).toBeNull();
  });

  it("summarizes punctuation pauses for read-aloud", () => {
    const m: Metrics = {
      ...metrics,
      punctuation: {
        commas: { expected: 6, honored: 2 },
        sentenceEnds: { expected: 4, honored: 3 },
        skipped: [],
      },
    };
    expect(punctuationSummary(m)).toEqual({
      honoredPct: 50,
      detail: "2 of 6 commas · 3 of 4 full stops",
    });
    expect(punctuationSummary(metrics)).toBeNull();
  });

  it("counts hesitations, falling back to long pauses for older analyses", () => {
    expect(hesitationSummary(metrics)).toEqual({ count: 1, detail: "long pauses (over 1.5 s)" });
    const m: Metrics = {
      ...metrics,
      pauses: { ...metrics.pauses, hesitationCount: 4, longestRunSec: 18 },
    };
    expect(hesitationSummary(m)).toEqual({
      count: 4,
      detail: "mid-sentence pauses · 18 s without a breath",
    });
  });

  it("orders subscores content-first and colors scores by band", () => {
    const feedback = {
      subscores: [
        { skill: "pace", score: 90 },
        { skill: "content", score: 60 },
        { skill: "voice", score: 40 },
      ],
    } as Feedback;
    expect(orderedSubscores(feedback).map((s) => s.skill)).toEqual(["content", "voice", "pace"]);
    expect([scoreSurface(80), scoreSurface(60), scoreSurface(30)]).toEqual([
      "bg-sage",
      "bg-butter",
      "bg-rose",
    ]);
  });
});
