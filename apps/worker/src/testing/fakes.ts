import type { AnalysisErrorCode, TranscriptWord } from "@speakup/shared";
import pino from "pino";
import type { AudioDecoder } from "../audio/decode.js";
import type { LlmResponse, SendToLlm } from "../feedback/claude.js";
import type { LlmOutput } from "../feedback/index.js";
import type { PipelineDeps } from "../pipeline.js";
import type { SttProvider, SttResult } from "../providers/stt.js";
import type { AnalysisRepo, AttemptForAnalysis, CompletedAnalysis } from "../repo.js";

export const silentLog = pino({ level: "silent" });

/** A valid model reply (the model gives a content score; overall is computed by us). */
export const validLlmOutput: LlmOutput = {
  contentScore: 64,
  summary: "You read clearly and at a comfortable pace.",
  strengths: ["Steady pace"],
  issues: [
    {
      category: "fillers",
      severity: "low",
      evidence: '"um" at 1.2s',
      tip: "Pause silently instead of saying um.",
    },
  ],
  nextStep: "Practice pausing at commas.",
};

/** n words "w0".."wn", 0.4 s apart. */
export function makeWords(n: number): TranscriptWord[] {
  return Array.from({ length: n }, (_, i) => ({
    word: `w${i}`,
    punctuated: `w${i}`,
    start: i * 0.4,
    end: i * 0.4 + 0.3,
    confidence: 0.95,
  }));
}

export function llmReply(body: unknown, overrides: Partial<LlmResponse> = {}): LlmResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    model: "claude-test",
    stopReason: "end_turn",
    text,
    content: [{ type: "text", text, citations: null }],
    usage: { inputTokens: 1000, outputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 0 },
    ...overrides,
  };
}

/** Returns the queued replies in order and records every request. */
export class FakeLlm {
  calls: Parameters<SendToLlm>[0][] = [];
  constructor(private replies: (LlmResponse | Error)[]) {}
  send: SendToLlm = async (messages) => {
    this.calls.push(structuredClone(messages));
    const next = this.replies.shift();
    if (!next) throw new Error("FakeLlm: no more replies");
    if (next instanceof Error) throw next;
    return next;
  };
}

export class FakeStt implements SttProvider {
  calls = 0;
  constructor(private result: SttResult | Error) {}
  async transcribe(): Promise<SttResult> {
    this.calls++;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class FakeRepo implements AnalysisRepo {
  transcriptSaved: AttemptForAnalysis["transcript"] = null;
  completed: CompletedAnalysis | null = null;
  failedWith: AnalysisErrorCode | null = null;
  statuses: string[] = [];

  constructor(public attempt: AttemptForAnalysis | null) {}

  async load() {
    return this.attempt && { ...this.attempt };
  }
  async markProcessing() {
    this.statuses.push("processing");
  }
  async saveTranscript(_id: string, t: NonNullable<AttemptForAnalysis["transcript"]>) {
    this.transcriptSaved = t;
  }
  async complete(_id: string, analysis: CompletedAnalysis) {
    this.completed = analysis;
    this.statuses.push("completed");
  }
  async fail(_id: string, code: AnalysisErrorCode) {
    this.failedWith = code;
    this.statuses.push("failed");
  }
}

export function makeAttempt(overrides: Partial<AttemptForAnalysis> = {}): AttemptForAnalysis {
  return {
    id: "att_1",
    status: "queued",
    audioKey: "recordings/user_1/att_1.webm",
    durationMs: 12_000,
    exercise: { type: "free_speech", prompt: "Introduce yourself", referenceText: null },
    goal: "job-interviews",
    transcript: null,
    ...overrides,
  };
}

export function makeDeps(parts: {
  repo: FakeRepo;
  stt?: FakeStt;
  llm?: FakeLlm;
  decoder?: AudioDecoder;
}): PipelineDeps {
  return {
    repo: parts.repo,
    storage: {
      getDownloadUrl: async (key) => `https://s3.test/${key}?signed`,
      deleteObjects: async () => {},
    },
    stt:
      parts.stt ??
      new FakeStt({ provider: "fake", durationSec: 12, text: "hello", words: makeWords(30) }),
    llm: (parts.llm ?? new FakeLlm([llmReply(validLlmOutput)])).send,
    ...(parts.decoder && { decoder: parts.decoder }),
    prices: { sttUsdPerMin: 0.0043, llmInputUsdPerMTok: 2, llmOutputUsdPerMTok: 10 },
  };
}

/**
 * Fake "speech" for audio tests: a tone during each word, near-silence between words.
 * Each word gets its own pitch and loudness (from the callbacks), so tests can make a voice
 * lively or monotone. 16 kHz mono, like the real decoder.
 */
export function synthSpeech(
  words: TranscriptWord[],
  opts: { pitchHz?: (i: number) => number; amplitude?: (i: number) => number } = {},
): Float32Array {
  const rate = 16_000;
  const end = (words.at(-1)?.end ?? 0) + 0.5;
  const out = new Float32Array(Math.ceil(end * rate));
  // Deterministic low noise floor (a real room is never digitally silent).
  let seed = 1;
  for (let n = 0; n < out.length; n++) {
    seed = (seed * 16807) % 2147483647;
    out[n] = ((seed / 2147483647) * 2 - 1) * 0.001;
  }
  words.forEach((w, i) => {
    const f0 = opts.pitchHz?.(i) ?? 120 + (i % 5) * 25;
    const amp = opts.amplitude?.(i) ?? (i % 3 === 0 ? 0.5 : 0.2);
    for (let n = Math.floor(w.start * rate); n < Math.floor(w.end * rate); n++) {
      // Fundamental + one harmonic: a little more voice-like than a pure sine.
      const t = n / rate;
      out[n] = amp * (0.7 * Math.sin(2 * Math.PI * f0 * t) + 0.3 * Math.sin(4 * Math.PI * f0 * t));
    }
  });
  return out;
}
