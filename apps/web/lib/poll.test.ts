import { describe, expect, it } from "vitest";
import { MAX_POLL_MS, nextPollDelay } from "./poll";

describe("nextPollDelay (results page polling)", () => {
  it("polls quickly at first: most results arrive within ~10 s", () => {
    expect(nextPollDelay(0)).toBe(1_500);
    expect(nextPollDelay(9_000)).toBe(1_500);
  });

  it("backs off while the user keeps waiting (the queue is busy: fewer polls, less DB load)", () => {
    expect(nextPollDelay(10_000)).toBe(3_000);
    expect(nextPollDelay(30_000)).toBe(5_000);
  });

  it("stops after the time limit", () => {
    expect(nextPollDelay(MAX_POLL_MS)).toBe(false);
  });
});
