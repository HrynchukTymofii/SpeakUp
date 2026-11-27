import { describe, expect, it } from "vitest";
import { BREATHING_TOTAL_SEC, breathingState } from "./breathing";

describe("breathingState", () => {
  it("starts on Breathe in, 4 s left, round 1", () => {
    expect(breathingState(0)).toEqual({
      phase: "Breathe in",
      secondsLeft: 4,
      round: 1,
      rounds: 4,
      finished: false,
    });
  });

  it("moves to Hold at 4 s and Breathe out at 8 s", () => {
    expect(breathingState(3).phase).toBe("Breathe in");
    expect(breathingState(4)).toMatchObject({ phase: "Hold", secondsLeft: 4, round: 1 });
    expect(breathingState(8)).toMatchObject({ phase: "Breathe out", secondsLeft: 4, round: 1 });
  });

  it("second Hold ends with 1 s left at 15 s", () => {
    expect(breathingState(12)).toMatchObject({ phase: "Hold", secondsLeft: 4, round: 1 });
    expect(breathingState(15)).toMatchObject({ phase: "Hold", secondsLeft: 1, round: 1 });
  });

  it("round 2 starts at 16 s", () => {
    expect(breathingState(16)).toMatchObject({ phase: "Breathe in", secondsLeft: 4, round: 2 });
  });

  it("is finished at 64 s", () => {
    expect(BREATHING_TOTAL_SEC).toBe(64);
    expect(breathingState(63)).toMatchObject({ round: 4, secondsLeft: 1, finished: false });
    expect(breathingState(64)).toMatchObject({ round: 4, finished: true });
  });
});
