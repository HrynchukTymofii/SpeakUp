import { AnalysisErrorCode, type TranscriptWord } from "@speakup/shared";
import { setTimeout as delay } from "node:timers/promises";
import { PipelineError } from "../errors.js";
import type { LlmResponse, SendToLlm } from "../feedback/claude.js";
import type { LlmOutput } from "../feedback/index.js";
import type { SttProvider, SttResult } from "./stt.js";

/**
 * Stand-ins for Deepgram and Claude, for LOAD TESTING ONLY (`ANALYSIS_PROVIDERS=fake`,
 * docs/load-testing.md). They never touch the network, so a test of 10 000 recordings costs
 * no provider money, but they hold the job for as long as the real call would. Everything
 * else in the pipeline (S3 download, ffmpeg, scoring, DB writes, the queue) stays real:
 * that is what a load test measures.
 */

/** Stored as `Analysis.llmModel`, so a fake result can never pass for a real one. */
export const FAKE_LLM_MODEL = "fake-llm";

interface FakeOptions {
  /** Typical (median) response time of the real provider. */
  medianMs: number;
  /** 0–1: share of calls that fail with a retryable error (a 429/5xx from the real provider). */
  failureRate: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}

/**
 * Response time as a log-normal around the median: most calls are near it, a few are much
 * slower. A fixed delay would make the system look smoother than it is — real p99s come from
 * that tail. σ = 0.4 gives p99 ≈ 2.5× the median, close to what we see from both APIs.
 * Clamped to 0.3×–5× so one unlucky draw can't stall a test.
 */
export function sampleLatencyMs(medianMs: number, random: () => number = Math.random): number {
  // Box–Muller: two uniforms → one standard normal. 1 - u keeps log() away from 0.
  const u1 = 1 - random();
  const u2 = random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = medianMs * Math.exp(0.4 * normal);
  return Math.min(Math.max(ms, medianMs * 0.3), medianMs * 5);
}

/** Waits like the real call, then maybe fails like it. */
async function simulateCall(opts: FakeOptions, code: AnalysisErrorCode, what: string) {
  const random = opts.random ?? Math.random;
  await (opts.sleep ?? delay)(sampleLatencyMs(opts.medianMs, random));
  if (random() < opts.failureRate) {
    throw new PipelineError(code, `${what}: simulated provider failure (load test)`, true);
  }
}

/**
 * A ~15 s answer with a few fillers and pauses, so metrics, scoring and feedback do real work.
 * It ignores the actual audio: load-test recordings are synthetic anyway.
 */
const SCRIPT =
  "so um I think the most important thing about public speaking is preparation " +
  "you know when I prepare well I feel calm and I can focus on the people in the room " +
  "uh instead of my notes and that makes the talk feel like a real conversation";

function scriptWords(): TranscriptWord[] {
  let t = 0.3;
  return SCRIPT.split(" ").map((word, i) => {
    const start = t;
    const end = start + 0.28;
    // A longer gap every ~8 words: a natural pause between phrases.
    t = end + (i % 8 === 7 ? 0.9 : 0.12);
    return { word, punctuated: word, start, end, confidence: 0.94 };
  });
}

export function createFakeStt(opts: FakeOptions): SttProvider {
  return {
    async transcribe(): Promise<SttResult> {
      await simulateCall(opts, AnalysisErrorCode.STT_FAILED, "STT");
      const words = scriptWords();
      return { provider: "fake", text: SCRIPT, words, durationSec: (words.at(-1)?.end ?? 0) + 0.6 };
    },
  };
}

const FAKE_FEEDBACK: LlmOutput = {
  contentScore: 70,
  summary: "Clear answer with a calm pace. (Fake feedback: load-test mode.)",
  strengths: ["Steady pace", "Clear structure"],
  issues: [
    {
      category: "fillers",
      severity: "low",
      evidence: '"um" near the start',
      tip: "Pause silently instead of saying um.",
    },
  ],
  nextStep: "Open with your main point, then give one example.",
};

export function createFakeLlm(opts: FakeOptions): SendToLlm {
  const text = JSON.stringify(FAKE_FEEDBACK);
  return async () => {
    await simulateCall(opts, AnalysisErrorCode.LLM_FAILED, "LLM");
    return {
      model: FAKE_LLM_MODEL,
      stopReason: "end_turn",
      text,
      content: [{ type: "text", text, citations: null }],
      // Roughly a real request's size, so cost estimates stay plausible (and clearly labeled).
      usage: { inputTokens: 2500, outputTokens: 400, cacheWriteTokens: 0, cacheReadTokens: 0 },
    } satisfies LlmResponse;
  };
}
