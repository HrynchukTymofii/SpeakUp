import { z } from "zod";

/**
 * The contract between the API (producer) and the worker (consumer).
 * Both sides import these from one place so a rename can't silently break the pipeline.
 */
export const ANALYSIS_QUEUE_NAME = "analysis";
export const ANALYZE_JOB_NAME = "analyze";

/**
 * Retry policy for `analyze` jobs (SPEC §6.3): 3 tries, waiting 5 s, 10 s, … between them.
 * Set on each job when it's added (see analyzeJobOptions).
 */
export const ANALYZE_JOB_ATTEMPTS = 3;
export const ANALYZE_JOB_BACKOFF_MS = 5_000;

/**
 * BullMQ options for every `analyze` job, shared by the API (first enqueue) and the worker's
 * stuck-attempt sweeper (re-enqueue), so a re-queued job retries exactly like the original.
 * Plain data, so this package doesn't depend on BullMQ.
 */
export function analyzeJobOptions(attemptId: string) {
  return {
    // Deduplication: BullMQ ignores an add() whose jobId already exists. A double submit, an API
    // retry or a sweeper re-queue of a job that is in fact still there all end up as ONE job.
    jobId: attemptId,
    attempts: ANALYZE_JOB_ATTEMPTS,
    backoff: { type: "exponential" as const, delay: ANALYZE_JOB_BACKOFF_MS },
    // Keep finished jobs for a day (debugging, and dedup keeps working meanwhile), then let
    // Redis forget them. The DB is the long-term record, not Redis.
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  };
}

/**
 * Job payload. Deliberately tiny: the attempt id (+ the API request id, so one recording can be
 * followed from the HTTP request to the worker in the logs). The worker loads everything else
 * from the DB, so the job never carries stale or sensitive data (transcripts, URLs) in Redis.
 */
export const AnalyzeJobDataSchema = z.strictObject({
  attemptId: z.string().min(1),
  requestId: z.string().max(100).optional(),
});
export type AnalyzeJobData = z.infer<typeof AnalyzeJobDataSchema>;

/**
 * Redis pub/sub channel on which the worker announces "this attempt changed" (processing,
 * transcribed, completed, failed). API tasks holding a `GET /attempts/:id?wait=` request for
 * that attempt answer right away instead of the browser asking again and again
 * (docs/scaling.md §2.2). Only the id travels; the API re-reads the attempt from the DB.
 */
export const ATTEMPT_EVENTS_CHANNEL = "attempt-events";

export const AttemptChangedEventSchema = z.strictObject({
  attemptId: z.string().min(1),
});
export type AttemptChangedEvent = z.infer<typeof AttemptChangedEventSchema>;
