import { z } from "zod";

/**
 * The contract between the API (producer) and the worker (consumer).
 * Both sides import these from one place so a rename can't silently break the pipeline.
 */
export const ANALYSIS_QUEUE_NAME = "analysis";
export const ANALYZE_JOB_NAME = "analyze";

/**
 * Retry policy for `analyze` jobs (SPEC §6.3): 3 tries, waiting 5 s, 10 s, … between them.
 * Set by the producer per job, so the worker doesn't need to know it.
 */
export const ANALYZE_JOB_ATTEMPTS = 3;
export const ANALYZE_JOB_BACKOFF_MS = 5_000;

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
