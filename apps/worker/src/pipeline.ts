import { AnalysisErrorCode, AnalyzeJobDataSchema, type Feedback } from "@speakup/shared";
import type { Logger } from "pino";
import type { AudioDecoder } from "./audio/decode.js";
import { extractFeatures, type AudioFeatures } from "./audio/features.js";
import { PipelineError } from "./errors.js";
import { estimateCostUsdMicros, type Prices } from "./feedback/cost.js";
import type { SendToLlm } from "./feedback/claude.js";
import { generateFeedback } from "./feedback/index.js";
import { PROMPT_VERSION } from "./feedback/prompt.js";
import { computeMetrics } from "./metrics/index.js";
import type { SttProvider } from "./providers/stt.js";
import type { AnalysisRepo } from "./repo.js";
import { computeSubscores, overallScore, toSubscoreList } from "./scoring.js";
import type { AudioStorage } from "./storage.js";

/** Fewer real words than this = nothing to give feedback on (SPEC §6.3) → NO_SPEECH, no LLM call. */
export const MIN_WORDS = 5;

export interface PipelineDeps {
  repo: AnalysisRepo;
  storage: AudioStorage;
  stt: SttProvider;
  /** Optional on purpose: without it (or when it fails) metrics come from the transcript only. */
  decoder?: AudioDecoder;
  llm: SendToLlm;
  prices: Prices;
}

export interface JobContext {
  /** True on the last allowed try: a retryable failure must be recorded now, not retried. */
  isFinalAttempt: boolean;
}

/**
 * One `analyze` job (SPEC §6.3): STT → audio features → metrics → scores → feedback → save.
 *
 * Idempotent: BullMQ may run a job again (retry, worker crash, stalled job), so
 * - an attempt that is already `completed` is skipped,
 * - a transcript saved by an earlier run is reused (no second STT bill),
 * - all writes are upserts / state updates that can safely happen twice.
 *
 * Logs contain ids, timings and error codes only — never transcripts or audio URLs (SPEC §9).
 */
export async function runAnalysis(
  rawData: unknown,
  ctx: JobContext,
  deps: PipelineDeps,
  log: Logger,
): Promise<void> {
  // Job data comes from Redis — a boundary, validate it.
  const { attemptId } = AnalyzeJobDataSchema.parse(rawData);
  const startedAt = Date.now();
  const { repo } = deps;

  const attempt = await repo.load(attemptId);
  if (!attempt) {
    log.warn({ attemptId }, "attempt not found, skipping");
    return;
  }
  if (attempt.status === "completed" || attempt.status === "failed") {
    log.info({ attemptId, status: attempt.status }, "attempt already finished, skipping");
    return;
  }

  try {
    await repo.markProcessing(attemptId);

    // 1. Speech-to-text (or reuse the transcript from an earlier run of this job).
    let transcript = attempt.transcript;
    let totalSec = (attempt.durationMs ?? 0) / 1000;
    if (!transcript) {
      const audioUrl = await deps.storage.getDownloadUrl(attempt.audioKey);
      const stt = await deps.stt.transcribe(audioUrl);
      transcript = { provider: stt.provider, text: stt.text, words: stt.words };
      totalSec = stt.durationSec;
      await repo.saveTranscript(attemptId, transcript);
      log.info({ attemptId, words: stt.words.length, ms: Date.now() - startedAt }, "transcribed");
    }

    // 2. Audio features (pitch, loudness, real silences). Best effort: a failure here costs
    //    detail, not the whole analysis — metrics fall back to the transcript.
    const audio = await audioFeatures(deps, attempt.audioKey, transcript.words, log, attemptId);

    // 3. Metrics (pure, instant).
    const exerciseType = attempt.exercise.type;
    const metrics = computeMetrics({
      words: transcript.words,
      totalSec,
      referenceText: exerciseType === "read_aloud" ? attempt.exercise.referenceText : null,
      audio,
    });
    if (metrics.wordCount < MIN_WORDS) {
      throw new PipelineError(AnalysisErrorCode.NO_SPEECH, "Too few words to analyze", false);
    }

    // 4. Scores we compute ourselves, then feedback (+ the content score) from the LLM.
    const subscores = computeSubscores(metrics, exerciseType);
    const result = await generateFeedback(deps.llm, {
      exercise: attempt.exercise,
      goal: attempt.goal,
      metrics,
      subscores: Object.fromEntries(
        Object.entries(subscores).map(([skill, score]) => [skill, Math.round(score)]),
      ),
      words: transcript.words,
    });
    const { contentScore, ...shown } = result.output;
    if (exerciseType === "free_speech" && contentScore !== null) subscores.content = contentScore;
    const feedback: Feedback = {
      ...shown,
      overallScore: overallScore(subscores, exerciseType),
      subscores: toSubscoreList(subscores),
    };

    // 5. Save. The cost estimate includes STT even when it was paid in an earlier run.
    const latencyMs = Date.now() - startedAt;
    await repo.complete(attemptId, {
      metrics,
      feedback,
      llmModel: result.model,
      promptVersion: PROMPT_VERSION,
      costUsdMicros: estimateCostUsdMicros(deps.prices, totalSec, result.usage),
      latencyMs,
    });
    log.info(
      { attemptId, latencyMs, score: feedback.overallScore, model: result.model },
      "analysis completed",
    );
  } catch (err) {
    const code = err instanceof PipelineError ? err.code : AnalysisErrorCode.INTERNAL;
    const retryable = err instanceof PipelineError ? err.retryable : true;
    if (!retryable || ctx.isFinalAttempt) {
      // Record the failure so the client stops polling and can show a message.
      await repo.fail(attemptId, code);
      log.warn({ attemptId, code, err: (err as Error).message }, "analysis failed");
    }
    throw err; // the caller (BullMQ) decides whether to retry
  }
}

async function audioFeatures(
  deps: PipelineDeps,
  audioKey: string,
  words: Parameters<typeof extractFeatures>[1],
  log: Logger,
  attemptId: string,
): Promise<AudioFeatures | null> {
  if (!deps.decoder) return null;
  const startedAt = Date.now();
  try {
    const samples = await deps.decoder.decode(await deps.storage.getDownloadUrl(audioKey));
    const features = extractFeatures(samples, words);
    log.info(
      { attemptId, reliable: features.reliable, ms: Date.now() - startedAt },
      "audio analyzed",
    );
    return features;
  } catch (err) {
    log.warn(
      { attemptId, err: (err as Error).message },
      "audio analysis failed, using transcript only",
    );
    return null;
  }
}
