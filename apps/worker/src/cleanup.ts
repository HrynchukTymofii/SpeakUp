import type { DbClient } from "@speakup/db";
import type { Logger } from "pino";

/** Unclaimed funnel sessions are deleted this long after they started (SPEC §9). */
export const FUNNEL_RETENTION_DAYS = 7;
/** Sessions handled per round: bounded transactions and S3 batch sizes. */
const BATCH = 100;

export interface CleanupRepo {
  /** Ids of unclaimed sessions created before `before`, oldest first. */
  findExpiredSessionIds(before: Date, limit: number): Promise<string[]>;
  /**
   * Deletes those sessions and their attempts — but only parts that are STILL unclaimed (a visitor
   * may sign up between find and delete). Returns the S3 keys of the deleted attempts.
   */
  deleteUnclaimed(sessionIds: string[]): Promise<string[]>;
}

export interface ObjectDeleter {
  deleteObjects(keys: string[]): Promise<void>;
}

/**
 * Daily privacy + cost cleanup: people who recorded in the funnel but never created an account.
 * Order matters: DB rows first (with "still unclaimed" guards), then their audio. If the S3 call
 * fails we leave a few orphan files (logged), never a row pointing at deleted audio.
 */
export async function cleanupFunnelSessions(
  deps: { repo: CleanupRepo; storage: ObjectDeleter; log: Logger },
  now: Date = new Date(),
): Promise<{ sessions: number; recordings: number }> {
  const before = new Date(now.getTime() - FUNNEL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let sessions = 0;
  let recordings = 0;

  for (;;) {
    const ids = await deps.repo.findExpiredSessionIds(before, BATCH);
    if (ids.length === 0) break;
    const keys = await deps.repo.deleteUnclaimed(ids);
    if (keys.length > 0) {
      try {
        await deps.storage.deleteObjects(keys);
      } catch (err) {
        deps.log.error({ err: (err as Error).message, count: keys.length }, "audio delete failed");
      }
    }
    sessions += ids.length;
    recordings += keys.length;
    if (ids.length < BATCH) break;
  }

  deps.log.info({ sessions, recordings }, "funnel cleanup done");
  return { sessions, recordings };
}

export function createPrismaCleanupRepo(db: DbClient): CleanupRepo {
  return {
    async findExpiredSessionIds(before, limit) {
      const rows = await db.funnelSession.findMany({
        where: { userId: null, createdAt: { lt: before } },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    async deleteUnclaimed(sessionIds) {
      // Interactive transaction: read the keys and delete in one consistent step.
      // Transcript/Analysis rows go with their attempt (onDelete: Cascade).
      return db.$transaction(async (tx) => {
        const attempts = await tx.attempt.findMany({
          where: { funnelSessionId: { in: sessionIds }, userId: null },
          select: { id: true, audioKey: true },
        });
        await tx.attempt.deleteMany({ where: { id: { in: attempts.map((a) => a.id) } } });
        // A session that was claimed meanwhile keeps its row (userId is no longer null).
        await tx.funnelSession.deleteMany({ where: { id: { in: sessionIds }, userId: null } });
        return attempts.map((a) => a.audioKey);
      });
    },
  };
}
