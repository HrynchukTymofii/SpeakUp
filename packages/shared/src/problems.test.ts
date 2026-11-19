import { describe, expect, it } from "vitest";
import type { Feedback, Metrics } from "./analysis.js";
import { detectProblems } from "./problems.js";

/** A clean, well-delivered take: no problem should be detected. */
function cleanMetrics(): Metrics {
  return {
    durationSec: 60,
    totalSec: 62,
    wordCount: 145,
    wpm: 145,
    wpmTarget: { min: 130, max: 160 },
    pauses: {
      count: 20,
      longCount: 0,
      longestSec: 0.9,
      list: [],
      hesitationCount: 0,
      longestRunSec: 6,
    },
    fillers: { count: 0, perMinute: 0, list: [] },
    lowConfidenceWords: [],
    readAloud: null,
    punctuation: null,
    voice: {
      reliable: true,
      pitchVariationSt: 3.5,
      pitchRangeSt: 9,
      loudnessVariationDb: 6,
      paceVariationPct: 30,
      trailingOff: { count: 0, sentences: 8, list: [] },
    },
    language: { repeatedPhrases: [], restarts: [], hedges: { count: 0, list: [] } },
  };
}

function feedback(issues: Feedback["issues"] = []): Feedback {
  return {
    overallScore: 80,
    summary: "Good.",
    strengths: ["Clear"],
    issues,
    nextStep: "Keep going.",
  };
}

describe("detectProblems", () => {
  it("finds nothing in a clean take", () => {
    expect(detectProblems(cleanMetrics(), feedback())).toEqual([]);
  });

  it("flags fillers from 2 per minute", () => {
    const m = cleanMetrics();
    m.fillers = { count: 4, perMinute: 4, list: [] };
    expect(detectProblems(m, feedback())).toContain("fillers");
  });

  it("flags hesitations and very long pauses", () => {
    const m = cleanMetrics();
    m.pauses.hesitationCount = 4;
    expect(detectProblems(m, feedback())).toContain("hesitations");

    const m2 = cleanMetrics();
    m2.pauses.longCount = 2;
    expect(detectProblems(m2, feedback())).toContain("hesitations");
  });

  it("flags read-aloud punctuation that was read straight through", () => {
    const m = cleanMetrics();
    m.punctuation = {
      commas: { expected: 4, honored: 1 },
      sentenceEnds: { expected: 4, honored: 3 },
      skipped: [],
    };
    expect(detectProblems(m, feedback())).toContain("skipped-punctuation");
  });

  it("flags run-on speech and a pace well above the target band", () => {
    const m = cleanMetrics();
    m.pauses.longestRunSec = 15;
    m.wpm = 190;
    const problems = detectProblems(m, feedback());
    expect(problems).toContain("run-on");
    expect(problems).toContain("too-fast");
  });

  it("flags a monotone voice, flat pace and trailing off", () => {
    const m = cleanMetrics();
    m.voice = {
      reliable: true,
      pitchVariationSt: 0.9,
      pitchRangeSt: 3,
      loudnessVariationDb: 6,
      paceVariationPct: 5,
      trailingOff: { count: 4, sentences: 8, list: [] },
    };
    expect(detectProblems(m, feedback())).toEqual(
      expect.arrayContaining(["monotone", "flat-pace", "trailing-off"]),
    );
  });

  it("ignores voice numbers from an unreliable (noisy) recording", () => {
    const m = cleanMetrics();
    m.voice = {
      reliable: false,
      pitchVariationSt: 0.2,
      pitchRangeSt: 1,
      loudnessVariationDb: 0.5,
      paceVariationPct: 1,
      trailingOff: { count: 5, sentences: 6, list: [] },
    };
    expect(detectProblems(m, feedback())).toEqual([]);
  });

  it("flags hedges from 2 occurrences", () => {
    const m = cleanMetrics();
    m.language = { repeatedPhrases: [], restarts: [], hedges: { count: 3, list: [] } };
    expect(detectProblems(m, feedback())).toContain("hedges");
  });

  it("flags structure only when the feedback calls it out above low severity", () => {
    const low = feedback([{ category: "structure", severity: "low", evidence: "e", tip: "t" }]);
    expect(detectProblems(cleanMetrics(), low)).toEqual([]);
    const high = feedback([{ category: "structure", severity: "high", evidence: "e", tip: "t" }]);
    expect(detectProblems(cleanMetrics(), high)).toEqual(["structure"]);
  });

  it("works with older analyses that lack the optional metrics", () => {
    const m = cleanMetrics();
    delete m.voice;
    delete m.language;
    delete m.punctuation;
    delete m.pauses.hesitationCount;
    delete m.pauses.longestRunSec;
    expect(detectProblems(m, feedback())).toEqual([]);
  });
});
