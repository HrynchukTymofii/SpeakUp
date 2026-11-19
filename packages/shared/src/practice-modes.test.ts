import { describe, expect, it } from "vitest";
import {
  MODE_EXERCISE_SLUG,
  MODE_TOPICS,
  PRACTICE_MODES,
  modeOfExerciseSlug,
  pickTopic,
} from "./practice-modes.js";

describe("practice modes", () => {
  it("every mode has its exercise and a bank of unique topics", () => {
    for (const mode of PRACTICE_MODES) {
      expect(modeOfExerciseSlug(MODE_EXERCISE_SLUG[mode])).toBe(mode);
      const topics = MODE_TOPICS[mode];
      expect(topics.length, mode).toBeGreaterThanOrEqual(12);
      expect(new Set(topics).size, mode).toBe(topics.length);
    }
    expect(modeOfExerciseSlug("baseline")).toBeUndefined();
  });

  it("never repeats a topic until the whole bank is used", () => {
    const bank = ["a", "b", "c"];
    const used = new Map<string, number>();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { topic } = pickTopic(bank, used);
      seen.push(topic);
      used.set(topic, (used.get(topic) ?? 0) + 1);
    }
    expect([...seen].sort()).toEqual(bank);
  });

  it("after a full round, starts over with the least-used topics", () => {
    const used = new Map([
      ["a", 2],
      ["b", 1],
      ["c", 2],
    ]);
    expect(pickTopic(["a", "b", "c"], used).topic).toBe("b");
  });

  it("counts how many topics of the bank are done", () => {
    const used = new Map([
      ["a", 1],
      ["not-in-bank", 3],
    ]);
    expect(pickTopic(["a", "b", "c"], used).done).toBe(1);
  });

  it("skips the topic the user just passed on, when there is another choice", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickTopic(["a", "b"], new Map(), "a").topic).toBe("b");
    }
    expect(pickTopic(["a"], new Map(), "a").topic).toBe("a");
  });
});
