import type { DbClient } from "@speakup/db";
import {
  ANALYZE_JOB_NAME,
  AnalysisErrorCode,
  analyzeJobOptions,
  type AnalyzeJobData,
} from "@speakup/shared";
import type { Queue } from "bullmq";
import type { Logger } from "pino";

/**
 * Stuck-attempt sweeper: the DB is the record of what SHOULD be analyzed, Redis only holds the
 * work in flight. If Redis loses its data (single node, restarted or replaced) or the API dies
 * between "status = queued" and "add job", an attempt sits in `queued`/`processing` with no job
 * behind it and the user waits forever. Every few minutes each worker compares the two and
 * repairs the difference. Safe to run on many workers at once: re-adding uses jobId = attemptId
 * (BullMQ ignores duplicates) and failing an attempt is a conditional update.
 */

/** An attempt untouched this long while queued/processing is checked. Longer than a normal
 *  analysis incl. retries, so we rarely even look at healthy work. */
export const STUCK_AFTER_MS = 10 * 60_000;
/** How often each worker sweeps (also once at startup, which matters after an outage). */
export const SWEEP_INTERVAL_MS = 5 * 60_000;
/** Attempts handled per DB round trip. */
const BATCH = 100;

/** What Redis knows about an attempt's job. */
export type JobState = "missing" | "alive" | "finished";

/** BullMQ's getJobState() → our three cases. "unknown" means no such job (never added, or lost). */
export function toJobState(state: string): JobState {
  if (state === "unknown") return "missing";
  if (state === "completed" || state === "failed") return "finished";
  return "alive"; // waiting, active, delayed, prioritized, waiting-children
}

export interface StuckAttemptRepo {
  /** Ids of queued/processing attempts last updated before `before`, ordered by id, after `afterId`. */
  findStuck(before: Date, afterId: string | null, limit: number): Promise<string[]>;
  /** Marks the attempt failed if it's still queued/processing. True if it changed it. */
  failIfUnfinished(attemptId: string, code: AnalysisErrorCode): Promise<boolean>;
}

export interface SweepQueue {
  jobState(attemptId: string): Promise<JobState>;
  requeue(attemptId: string): Promise<void>;
}

export async function sweepStuckAttempts(
  deps: {
    repo: StuckAttemptRepo;
    queue: SweepQueue;
    /** Wakes a results page long-polling this attempt (see attempt-events.ts). */
    announce: (attemptId: string) => Promise<void>;
    log: Logger;
  },
  now: Date = new Date(),
): Promise<{ requeued: number; failed: number }> {
  const before = new Date(now.getTime() - STUCK_AFTER_MS);
  let requeued = 0;
  let failed = 0;
  // Keyset paging by id: re-queuing doesn't change a row, so "first N" would repeat forever.
  let afterId: string | null = null;

  for (;;) {
    const ids = await deps.repo.findStuck(before, afterId, BATCH);
    for (const attemptId of ids) {
      const state = await deps.queue.jobState(attemptId);
      if (state === "missing") {
        await deps.queue.requeue(attemptId);
        requeued++;
        deps.log.warn({ attemptId }, "re-queued attempt whose job was missing from Redis");
      } else if (state === "finished") {
        // The job ended but the attempt never got a result, e.g. BullMQ failed a job that
        // stalled twice (worker crashed mid-run), so the pipeline's own fail() never ran.
        // Re-running a job that crashes workers is worse than an honest error the user can retry.
        if (await deps.repo.failIfUnfinished(attemptId, AnalysisErrorCode.INTERNAL)) {
          failed++;
          deps.log.warn({ attemptId }, "failed attempt whose job ended without a result");
          await deps.announce(attemptId);
        }
      }
      // "alive": BullMQ still owns it (incl. stalled-job recovery of an active job). Leave it.
    }
    if (ids.length < BATCH) break;
    afterId = ids[ids.length - 1] ?? null;
  }

  if (requeued > 0 || failed > 0) deps.log.info({ requeued, failed }, "stuck-attempt sweep done");
  return { requeued, failed };
}

/**
 * Runs `sweep` now and every `intervalMs`, never two at once. A plain in-process timer on
 * purpose, not a BullMQ job scheduler: the schedule must survive exactly the Redis data loss
 * the sweeper exists to repair. Returns a stop function.
 */
export function startSweeper(opts: {
  sweep: () => Promise<unknown>;
  intervalMs: number;
  onError: (err: Error) => void;
}): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await opts.sweep();
    } catch (err) {
      opts.onError(err as Error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), opts.intervalMs);
  return () => clearInterval(timer);
}

export function createPrismaStuckAttemptRepo(db: DbClient): StuckAttemptRepo {
  const unfinished = { in: ["queued" as const, "processing" as const] };
  return {
    async findStuck(before, afterId, limit) {
      const rows = await db.attempt.findMany({
        where: {
          status: unfinished,
          updatedAt: { lt: before },
          ...(afterId !== null && { id: { gt: afterId } }),
        },
        orderBy: { id: "asc" },
        take: limit,
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    async failIfUnfinished(attemptId, code) {
      // Conditional: if the attempt finished meanwhile (or another worker's sweep got here
      // first), leave it as it is.
      const { count } = await db.attempt.updateMany({
        where: { id: attemptId, status: unfinished },
        data: { status: "failed", errorCode: code },
      });
      return count === 1;
    },
  };
}

export function createBullSweepQueue(queue: Queue): SweepQueue {
  return {
    jobState: async (attemptId) => toJobState(await queue.getJobState(attemptId)),
    async requeue(attemptId) {
      const data: AnalyzeJobData = { attemptId };
      await queue.add(ANALYZE_JOB_NAME, data, analyzeJobOptions(attemptId));
    },
  };
}
