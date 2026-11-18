import {
  ANALYSIS_QUEUE_NAME,
  ANALYZE_JOB_ATTEMPTS,
  ANALYZE_JOB_BACKOFF_MS,
  ANALYZE_JOB_NAME,
  type AnalyzeJobData,
} from "@speakup/shared";
import { Queue } from "bullmq";

/** The API's side of the job queue: it only ever adds analysis jobs. */
export interface AnalysisQueue {
  enqueueAnalysis(attemptId: string, requestId?: string): Promise<void>;
  close(): Promise<void>;
}

export function createBullAnalysisQueue(redisUrl: string): AnalysisQueue {
  const queue = new Queue<AnalyzeJobData>(ANALYSIS_QUEUE_NAME, {
    connection: { url: redisUrl },
  });

  return {
    async enqueueAnalysis(attemptId, requestId) {
      await queue.add(
        ANALYZE_JOB_NAME,
        { attemptId, ...(requestId && { requestId }) },
        {
          // Deduplication: BullMQ ignores an add() whose jobId already exists. If the client
          // double-submits, or we retry after a crash, the attempt is still analyzed once.
          jobId: attemptId,
          attempts: ANALYZE_JOB_ATTEMPTS,
          backoff: { type: "exponential", delay: ANALYZE_JOB_BACKOFF_MS },
          // Keep finished jobs for a day (debugging, and dedup keeps working meanwhile),
          // then let Redis forget them. The DB is the long-term record, not Redis.
          removeOnComplete: { age: 24 * 60 * 60 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      );
    },
    close: () => queue.close(),
  };
}
