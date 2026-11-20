import { describe, expect, it } from "vitest";
import { LlmOutputSchema } from "../feedback/index.js";
import { PipelineError } from "../errors.js";
import { createFakeLlm, createFakeStt, FAKE_LLM_MODEL, sampleLatencyMs } from "./fake.js";

/** Records the requested sleeps instead of waiting, so tests run instantly. */
function fakeClock() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
}

/** A fixed sequence of "random" numbers, repeated. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("sampleLatencyMs", () => {
  it("returns the median when the random draw is in the middle", () => {
    // Box–Muller with u2 = 0.25 → cos(π/2) = 0 → a standard normal of 0 → exactly the median.
    expect(sampleLatencyMs(1000, seq(0.5, 0.25))).toBeCloseTo(1000, 6);
  });

  it("spreads around the median with a long right tail, clamped to 0.3×–5×", () => {
    const random = Math.random;
    const samples = Array.from({ length: 5000 }, () => sampleLatencyMs(2000, random)).sort(
      (a, b) => a - b,
    );
    const median = samples[2500] ?? 0;
    const p99 = samples[4950] ?? 0;
    expect(median).toBeGreaterThan(1800);
    expect(median).toBeLessThan(2200);
    expect(p99).toBeGreaterThan(median * 1.8); // a real tail, not a flat delay
    expect(samples[0]).toBeGreaterThanOrEqual(600);
    expect(samples.at(-1)).toBeLessThanOrEqual(10_000);
  });
});

describe("fake STT", () => {
  it("waits a sampled latency, then returns a transcript the pipeline can score", async () => {
    const clock = fakeClock();
    const stt = createFakeStt({ medianMs: 1000, failureRate: 0, random: seq(0.5), ...clock });

    const result = await stt.transcribe("https://s3.test/a.webm?signed");

    expect(clock.sleeps).toHaveLength(1);
    expect(result.provider).toBe("fake");
    expect(result.words.length).toBeGreaterThanOrEqual(30); // above MIN_WORDS, so no NO_SPEECH
    expect(result.durationSec).toBeGreaterThan(result.words.at(-1)?.end ?? Infinity);
    expect(result.words.some((w) => w.word === "um")).toBe(true); // metrics have something to find
  });

  it("fails with a retryable STT error at the configured rate", async () => {
    const stt = createFakeStt({
      medianMs: 10,
      failureRate: 0.5,
      random: seq(0.1), // < 0.5 → fail
      sleep: async () => {},
    });
    const err = await stt.transcribe("u").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as PipelineError).code).toBe("STT_FAILED");
    expect((err as PipelineError).retryable).toBe(true);
  });
});

describe("fake LLM", () => {
  it("waits a sampled latency and returns feedback that passes our own validation", async () => {
    const clock = fakeClock();
    const send = createFakeLlm({ medianMs: 2000, failureRate: 0, random: seq(0.5), ...clock });

    const reply = await send([{ role: "user", content: "hi" }]);

    expect(clock.sleeps).toHaveLength(1);
    expect(reply.model).toBe(FAKE_LLM_MODEL); // stored on the analysis: fake results are marked
    expect(LlmOutputSchema.safeParse(JSON.parse(reply.text)).success).toBe(true);
    expect(reply.usage.inputTokens).toBeGreaterThan(0);
  });

  it("fails with a retryable LLM error at the configured rate", async () => {
    const send = createFakeLlm({
      medianMs: 10,
      failureRate: 1,
      random: seq(0.99),
      sleep: async () => {},
    });
    const err = await send([]).catch((e: unknown) => e);
    expect((err as PipelineError).code).toBe("LLM_FAILED");
    expect((err as PipelineError).retryable).toBe(true);
  });
});
