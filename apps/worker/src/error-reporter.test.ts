import { AnalysisErrorCode } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { createErrorReporter, shouldReportJobFailure } from "./error-reporter.js";
import { PipelineError } from "./errors.js";

describe("which analysis failures reach the error tracker", () => {
  const retryable = new PipelineError(AnalysisErrorCode.STT_FAILED, "Deepgram 503", true);

  it("skips a retryable failure while retries remain (BullMQ will try again)", () => {
    expect(shouldReportJobFailure(retryable, false)).toBe(false);
  });

  it("reports it on the final attempt: the user got no feedback", () => {
    expect(shouldReportJobFailure(retryable, true)).toBe(true);
  });

  it("reports a permanent failure at once (no retries follow)", () => {
    const invalid = new PipelineError(AnalysisErrorCode.LLM_INVALID_OUTPUT, "bad JSON", false);
    expect(shouldReportJobFailure(invalid, false)).toBe(true);
  });

  it("never reports NO_SPEECH: the user said nothing, the system worked", () => {
    const silent = new PipelineError(AnalysisErrorCode.NO_SPEECH, "no words", false);
    expect(shouldReportJobFailure(silent, false)).toBe(false);
    expect(shouldReportJobFailure(silent, true)).toBe(false);
  });

  it("reports an unexpected error (a bug) on the final attempt", () => {
    expect(shouldReportJobFailure(new TypeError("x is undefined"), true)).toBe(true);
    expect(shouldReportJobFailure(new TypeError("x is undefined"), false)).toBe(false);
  });
});

describe("createErrorReporter", () => {
  it("does nothing without a DSN (local dev, tests)", async () => {
    const reporter = createErrorReporter({
      dsn: undefined,
      environment: "test",
      service: "worker",
    });
    expect(() => reporter.capture(new Error("x"), {})).not.toThrow();
    await expect(reporter.flush(10)).resolves.toBeUndefined();
  });
});
