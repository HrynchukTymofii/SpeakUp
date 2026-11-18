import type { AnalysisErrorCode } from "@speakup/shared";

/**
 * A pipeline failure with a stable code (saved to `Attempt.errorCode`) and a decision about
 * retrying. Retrying helps with timeouts, 429s and 5xx; it never helps with a silent recording
 * or a 400 — those should fail at once instead of burning 3 attempts (and money).
 */
export class PipelineError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
