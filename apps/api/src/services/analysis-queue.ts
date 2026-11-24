import {
  ANALYSIS_QUEUE_NAME,
  ANALYZE_JOB_NAME,
  analyzeJobOptions,
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
      // jobId = attemptId (dedup) and the retry policy come from the shared options.
      await queue.add(
        ANALYZE_JOB_NAME,
        { attemptId, ...(requestId && { requestId }) },
        analyzeJobOptions(attemptId),
      );
    },
    close: () => queue.close(),
  };
}
