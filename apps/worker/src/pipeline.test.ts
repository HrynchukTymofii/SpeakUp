import { describe, expect, it } from "vitest";
import { PipelineError } from "./errors.js";
import { runAnalysis } from "./pipeline.js";
import {
  FakeLlm,
  FakeRepo,
  FakeStt,
  llmReply,
  makeAttempt,
  makeDeps,
  makeWords,
  silentLog,
  validFeedback,
} from "./testing/fakes.js";

const job = { attemptId: "att_1" };
const notFinal = { isFinalAttempt: false };
const final = { isFinalAttempt: true };

describe("runAnalysis", () => {
  it("happy path: transcribes, computes metrics, gets feedback, saves everything", async () => {
    const repo = new FakeRepo(makeAttempt());
    const llm = new FakeLlm([llmReply(validFeedback)]);
    await runAnalysis(job, notFinal, makeDeps({ repo, llm }), silentLog);

    expect(repo.statuses).toEqual(["processing", "completed"]);
    expect(repo.transcriptSaved?.words).toHaveLength(30);
    expect(repo.completed).toMatchObject({
      feedback: validFeedback,
      llmModel: "claude-test",
      promptVersion: "feedback-v1",
    });
    expect(repo.completed?.metrics.wordCount).toBe(30);
    // 12 s of STT at $0.0043/min + 1000 input tokens at $2/M + 200 output at $10/M = $0.00486
    expect(repo.completed?.costUsdMicros).toBe(4860);
    // The goal from onboarding reaches the prompt.
    expect(JSON.stringify(llm.calls[0])).toContain("job-interviews");
  });

  it("is idempotent: a completed attempt is skipped without any API calls", async () => {
    const repo = new FakeRepo(makeAttempt({ status: "completed" }));
    const stt = new FakeStt(new Error("must not be called"));
    await runAnalysis(job, notFinal, makeDeps({ repo, stt }), silentLog);
    expect(stt.calls).toBe(0);
    expect(repo.statuses).toEqual([]);
  });

  it("reuses a transcript saved by an earlier run (no second STT bill)", async () => {
    const saved = { provider: "fake", text: "x", words: makeWords(20) };
    const repo = new FakeRepo(makeAttempt({ status: "processing", transcript: saved }));
    const stt = new FakeStt(new Error("must not be called"));
    await runAnalysis(job, notFinal, makeDeps({ repo, stt }), silentLog);
    expect(stt.calls).toBe(0);
    expect(repo.completed?.metrics.wordCount).toBe(20);
  });

  it("NO_SPEECH: fewer than 5 words fails at once and never calls the LLM", async () => {
    const repo = new FakeRepo(makeAttempt());
    const stt = new FakeStt({
      provider: "fake",
      durationSec: 5,
      text: "um hi",
      words: makeWords(2),
    });
    const llm = new FakeLlm([]);
    const run = runAnalysis(job, notFinal, makeDeps({ repo, stt, llm }), silentLog);

    await expect(run).rejects.toMatchObject({ code: "NO_SPEECH", retryable: false });
    expect(repo.failedWith).toBe("NO_SPEECH");
    expect(llm.calls).toHaveLength(0);
  });

  it("NO_SPEECH when the recording produced no words at all (silence)", async () => {
    const repo = new FakeRepo(makeAttempt());
    const stt = new FakeStt({ provider: "fake", durationSec: 10, text: "", words: [] });
    const llm = new FakeLlm([]);
    await expect(
      runAnalysis(job, notFinal, makeDeps({ repo, stt, llm }), silentLog),
    ).rejects.toMatchObject({
      code: "NO_SPEECH",
    });
    expect(repo.failedWith).toBe("NO_SPEECH");
    expect(llm.calls).toHaveLength(0);
  });

  it("NO_SPEECH when only filler sounds were recognized ('um uh um…')", async () => {
    const repo = new FakeRepo(makeAttempt());
    const fillers = ["um", "uh", "um", "uh", "um", "uh", "um"].map((word, i) => ({
      word,
      punctuated: word,
      start: i * 0.6,
      end: i * 0.6 + 0.3,
      confidence: 0.9,
    }));
    const stt = new FakeStt({ provider: "fake", durationSec: 5, text: "um uh", words: fillers });
    await expect(
      runAnalysis(job, notFinal, makeDeps({ repo, stt }), silentLog),
    ).rejects.toMatchObject({
      code: "NO_SPEECH",
    });
  });

  it("a retryable error before the last try leaves the attempt for the retry", async () => {
    const repo = new FakeRepo(makeAttempt());
    const stt = new FakeStt(new PipelineError("STT_FAILED", "timeout", true));
    await expect(runAnalysis(job, notFinal, makeDeps({ repo, stt }), silentLog)).rejects.toThrow();
    expect(repo.failedWith).toBeNull();
  });

  it("a retryable error on the final try marks the attempt failed", async () => {
    const repo = new FakeRepo(makeAttempt());
    const stt = new FakeStt(new PipelineError("STT_FAILED", "timeout", true));
    await expect(runAnalysis(job, final, makeDeps({ repo, stt }), silentLog)).rejects.toThrow();
    expect(repo.failedWith).toBe("STT_FAILED");
  });

  it("an unexpected error is recorded as INTERNAL on the final try", async () => {
    const repo = new FakeRepo(makeAttempt());
    const stt = new FakeStt(new Error("boom"));
    await expect(runAnalysis(job, final, makeDeps({ repo, stt }), silentLog)).rejects.toThrow();
    expect(repo.failedWith).toBe("INTERNAL");
  });

  it("uses the reference text only for read_aloud exercises", async () => {
    const repo = new FakeRepo(
      makeAttempt({
        exercise: { type: "read_aloud", prompt: "Read this", referenceText: "w0 w1 w2 w3 w4" },
      }),
    );
    await runAnalysis(job, notFinal, makeDeps({ repo }), silentLog);
    expect(repo.completed?.metrics.readAloud?.referenceWordCount).toBe(5);
  });

  it("skips a missing attempt (deleted meanwhile) without failing", async () => {
    const repo = new FakeRepo(null);
    await expect(
      runAnalysis(job, notFinal, makeDeps({ repo }), silentLog),
    ).resolves.toBeUndefined();
  });

  it("rejects malformed job data", async () => {
    const repo = new FakeRepo(makeAttempt());
    await expect(runAnalysis({ id: 1 }, notFinal, makeDeps({ repo }), silentLog)).rejects.toThrow();
  });
});
