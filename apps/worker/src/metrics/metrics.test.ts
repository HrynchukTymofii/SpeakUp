import type { TranscriptWord } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { detectFillers } from "./fillers.js";
import { computeMetrics } from "./index.js";
import { normalizeWord, tokenize } from "./normalize.js";
import { alignWords, readAloudMetrics } from "./read-aloud.js";

/**
 * Builds a transcript from "word@start-end" specs, e.g. "hello@0-0.4".
 * Confidence defaults to 0.95; append ":0.4" to override ("mumble@1-1.3:0.4").
 */
function words(...specs: string[]): TranscriptWord[] {
  return specs.map((spec) => {
    const [text = "", rest = ""] = spec.split("@");
    const [range = "", conf] = rest.split(":");
    const [start = "0", end = "0"] = range.split("-");
    return {
      word: normalizeWord(text),
      punctuated: text,
      start: Number(start),
      end: Number(end),
      confidence: conf ? Number(conf) : 0.95,
    };
  });
}

/** n evenly spaced words, each 0.3 s long with a 0.1 s gap. */
function evenWords(n: number, offset = 0): TranscriptWord[] {
  return Array.from({ length: n }, (_, i) => ({
    word: `w${i}`,
    punctuated: `w${i}`,
    start: offset + i * 0.4,
    end: offset + i * 0.4 + 0.3,
    confidence: 0.95,
  }));
}

describe("normalize", () => {
  it("lowercases and strips punctuation, keeping in-word apostrophes", () => {
    expect(normalizeWord("Pace,")).toBe("pace");
    expect(normalizeWord("Don’t")).toBe("don't");
    expect(normalizeWord("“Hello!”")).toBe("hello");
    expect(normalizeWord("—")).toBe("");
  });

  it("tokenizes text and splits hyphenated words", () => {
    expect(tokenize("A well-known fact — really.")).toEqual([
      "a",
      "well",
      "known",
      "fact",
      "really",
    ]);
  });
});

describe("detectFillers", () => {
  it("always counts pure fillers like um/uh", () => {
    const hits = detectFillers(words("So@0-0.2", "um@0.3-0.5", "I@0.6-0.7", "uh@0.8-1"));
    expect(hits.map((h) => h.word)).toEqual(["um", "uh"]);
  });

  it("counts 'like' only when isolated by pauses (conservative)", () => {
    const asVerb = words("I@0-0.2", "like@0.25-0.5", "tea@0.55-0.8");
    expect(detectFillers(asVerb)).toEqual([]);

    const asFiller = words("it@0-0.2", "was@0.25-0.4", "like@0.9-1.1", "huge@1.6-1.9");
    expect(detectFillers(asFiller).map((h) => h.word)).toEqual(["like"]);
  });

  it("detects 'you know' as one filler spanning two words", () => {
    const hits = detectFillers(
      words("fine@0-0.3", "you@0.8-0.9", "know,@0.95-1.1", "then@1.2-1.4"),
    );
    expect(hits).toEqual([{ word: "you know", start: 0.8, wordIndex: 1, indexes: [1, 2] }]);
  });

  it("does not count 'you know' inside a sentence", () => {
    expect(
      detectFillers(words("do@0-0.2", "you@0.25-0.4", "know@0.45-0.6", "her@0.65-0.8")),
    ).toEqual([]);
  });
});

describe("alignWords / readAloudMetrics", () => {
  it("perfect reading → 100 %", () => {
    const m = readAloudMetrics(["the", "cat", "sat"], ["the", "cat", "sat"]);
    expect(m).toEqual({
      accuracyPct: 100,
      referenceWordCount: 3,
      missed: [],
      substituted: [],
      inserted: [],
    });
  });

  it("detects a substitution as one op (not missed + inserted)", () => {
    const ops = alignWords(["the", "cat", "sat"], ["the", "bat", "sat"]);
    expect(ops).toEqual([
      { kind: "match", expected: "the", ref: 0, spoken: 0 },
      { kind: "sub", expected: "cat", said: "bat", ref: 1, spoken: 1 },
      { kind: "match", expected: "sat", ref: 2, spoken: 2 },
    ]);
  });

  it("reports missed and inserted words", () => {
    const m = readAloudMetrics(
      ["slow", "down", "and", "pause", "often"],
      ["slow", "and", "really", "pause", "often"],
    );
    expect(m.missed).toEqual(["down"]);
    expect(m.inserted).toEqual(["really"]);
    expect(m.substituted).toEqual([]);
    expect(m.accuracyPct).toBe(80);
  });

  it("handles empty inputs", () => {
    expect(readAloudMetrics([], ["hi"]).accuracyPct).toBe(0);
    expect(readAloudMetrics(["hi"], []).missed).toEqual(["hi"]);
  });
});

describe("computeMetrics", () => {
  it("computes words per minute over speaking time, excluding fillers", () => {
    // 150 words over exactly 60 s of speaking, plus 2 s of silence at the start.
    const speech = Array.from({ length: 150 }, (_, i) => ({
      word: `w${i}`,
      punctuated: `w${i}`,
      start: 2 + i * 0.4,
      end: 2 + i * 0.4 + 0.3,
      confidence: 0.95,
    }));
    const lastWord = speech.at(-1);
    if (lastWord) lastWord.end = 62;
    const m = computeMetrics({ words: speech, totalSec: 63, referenceText: null, audio: null });
    expect(m.durationSec).toBe(60);
    expect(m.totalSec).toBe(63);
    expect(m.wordCount).toBe(150);
    expect(m.wpm).toBe(150);
    expect(m.wpmTarget).toEqual({ min: 130, max: 160 });
    expect(m.readAloud).toBeNull();
  });

  it("counts fillers per minute and leaves them out of the word count", () => {
    const ws = [...evenWords(10), ...words("um@4-4.2", "uh@4.3-4.5")];
    const m = computeMetrics({ words: ws, totalSec: 5, referenceText: null, audio: null });
    expect(m.wordCount).toBe(10);
    expect(m.fillers.count).toBe(2);
    expect(m.fillers.perMinute).toBe(26.7); // 2 fillers / 4.5 s
  });

  it("lists low-confidence words", () => {
    const m = computeMetrics({
      words: words("clear@0-0.4", "mumble@0.5-0.9:0.42"),
      totalSec: 1,
      referenceText: null,
      audio: null,
    });
    expect(m.lowConfidenceWords).toEqual([
      { word: "mumble", start: 0.5, confidence: 0.42, wordIndex: 1 },
    ]);
  });

  it("computes read-aloud accuracy, ignoring punctuation, case and fillers", () => {
    const m = computeMetrics({
      words: words("The@0-0.2", "um@0.3-0.5", "cat@0.6-0.8", "sat.@0.9-1.2"),
      totalSec: 1.5,
      referenceText: "The cat sat.",
      audio: null,
    });
    expect(m.readAloud?.accuracyPct).toBe(100);
  });

  it("returns zeros instead of dividing by zero for empty or tiny transcripts", () => {
    const m = computeMetrics({ words: [], totalSec: 3, referenceText: null, audio: null });
    expect(m).toMatchObject({ durationSec: 0, wordCount: 0, wpm: 0 });
    expect(m.pauses.longestSec).toBe(0);
    expect(m.fillers.perMinute).toBe(0);
  });
});
