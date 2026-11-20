import { describe, expect, it } from "vitest";
import { MAX_POLL_MS, nextPollDelay, RESULT_WAIT_S } from "./poll";

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

describe("nextPollDelay with long-polling (the API holds the request until the worker is done)", () => {
  it("asks again right away when the API held the last request", () => {
    // The server already waited, so there is nothing to gain from waiting again on our side.
    expect(nextPollDelay(25_000, 20_000)).toBe(1);
  });

  it("falls back to backing off when the API answered at once (old API, or a quick status change)", () => {
    expect(nextPollDelay(2_000, 150)).toBe(1_500);
    expect(nextPollDelay(40_000, 150)).toBe(5_000);
  });

  it("still stops after the time limit", () => {
    expect(nextPollDelay(MAX_POLL_MS, 20_000)).toBe(false);
  });

  it("asks the API to hold for less than its 25 s maximum", () => {
    expect(RESULT_WAIT_S).toBeGreaterThan(0);
    expect(RESULT_WAIT_S).toBeLessThanOrEqual(25);
  });
});
