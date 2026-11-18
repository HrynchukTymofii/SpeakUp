import { describe, expect, it } from "vitest";
import { cleanupFunnelSessions, type CleanupRepo } from "./cleanup.js";
import { silentLog } from "./testing/fakes.js";

const NOW = new Date("2026-11-18T03:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

interface Row {
  id: string;
  createdAt: Date;
  userId: string | null;
  attempts: { audioKey: string; userId: string | null }[];
}

/** In-memory repo with the same "still unclaimed" guards as the Prisma one. */
class FakeCleanupRepo implements CleanupRepo {
  constructor(public sessions: Row[]) {}
  async findExpiredSessionIds(before: Date, limit: number) {
    return this.sessions
      .filter((s) => s.userId === null && s.createdAt < before)
      .slice(0, limit)
      .map((s) => s.id);
  }
  async deleteUnclaimed(ids: string[]) {
    const doomed = this.sessions.filter((s) => ids.includes(s.id) && s.userId === null);
    this.sessions = this.sessions.filter((s) => !doomed.includes(s));
    return doomed.flatMap((s) =>
      s.attempts.filter((a) => a.userId === null).map((a) => a.audioKey),
    );
  }
}

describe("cleanupFunnelSessions", () => {
  it("deletes unclaimed sessions older than 7 days and their audio, keeps everything else", async () => {
    const repo = new FakeCleanupRepo([
      {
        id: "old",
        createdAt: daysAgo(8),
        userId: null,
        attempts: [{ audioKey: "k-old", userId: null }],
      },
      {
        id: "fresh",
        createdAt: daysAgo(2),
        userId: null,
        attempts: [{ audioKey: "k-fresh", userId: null }],
      },
      {
        id: "claimed",
        createdAt: daysAgo(30),
        userId: "u1",
        attempts: [{ audioKey: "k-claimed", userId: "u1" }],
      },
    ]);
    const deleted: string[] = [];
    const result = await cleanupFunnelSessions(
      {
        repo,
        storage: { deleteObjects: async (keys) => void deleted.push(...keys) },
        log: silentLog,
      },
      NOW,
    );

    expect(result).toEqual({ sessions: 1, recordings: 1 });
    expect(deleted).toEqual(["k-old"]);
    expect(repo.sessions.map((s) => s.id)).toEqual(["fresh", "claimed"]);
  });

  it("keeps going when S3 deletion fails (DB is already clean, orphans are logged)", async () => {
    const repo = new FakeCleanupRepo([
      {
        id: "old",
        createdAt: daysAgo(9),
        userId: null,
        attempts: [{ audioKey: "k", userId: null }],
      },
    ]);
    const storage = {
      deleteObjects: async () => {
        throw new Error("S3 down");
      },
    };
    await expect(cleanupFunnelSessions({ repo, storage, log: silentLog }, NOW)).resolves.toEqual({
      sessions: 1,
      recordings: 1,
    });
    expect(repo.sessions).toEqual([]);
  });

  it("handles more sessions than one batch", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      id: `s${i}`,
      createdAt: daysAgo(10),
      userId: null,
      attempts: [],
    }));
    const repo = new FakeCleanupRepo(rows);
    const result = await cleanupFunnelSessions(
      { repo, storage: { deleteObjects: async () => {} }, log: silentLog },
      NOW,
    );
    expect(result.sessions).toBe(250);
    expect(repo.sessions).toEqual([]);
  });
});
