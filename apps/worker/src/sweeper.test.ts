import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STUCK_AFTER_MS,
  startSweeper,
  sweepStuckAttempts,
  toJobState,
  type JobState,
  type StuckAttemptRepo,
} from "./sweeper.js";
import { silentLog } from "./testing/fakes.js";

const NOW = new Date("2026-11-24T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const OLD = minutesAgo(STUCK_AFTER_MS / 60_000 + 1);

interface Row {
  id: string;
  status: "awaiting_upload" | "queued" | "processing" | "completed" | "failed";
  updatedAt: Date;
  errorCode?: string;
}

/** In-memory repo with the same filters as the Prisma one (keyset pages by id). */
class FakeRepo implements StuckAttemptRepo {
  constructor(public rows: Row[]) {}
  async findStuck(before: Date, afterId: string | null, limit: number) {
    return this.rows
      .filter((r) => (r.status === "queued" || r.status === "processing") && r.updatedAt < before)
      .filter((r) => afterId === null || r.id > afterId)
      .map((r) => r.id)
      .sort()
      .slice(0, limit);
  }
  async failIfUnfinished(id: string, code: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || (row.status !== "queued" && row.status !== "processing")) return false;
    row.status = "failed";
    row.errorCode = code;
    return true;
  }
}

/** Redis as the sweeper sees it: a job state per attempt id ("missing" when absent). */
function fakeQueue(states: Record<string, JobState> = {}) {
  const requeued: string[] = [];
  return {
    requeued,
    queue: {
      jobState: async (id: string) => states[id] ?? "missing",
      requeue: async (id: string) => void requeued.push(id),
    },
  };
}

function deps(repo: FakeRepo, queue: ReturnType<typeof fakeQueue>["queue"]) {
  const announced: string[] = [];
  return {
    announced,
    deps: { repo, queue, announce: async (id: string) => void announced.push(id), log: silentLog },
  };
}

describe("sweepStuckAttempts", () => {
  it("re-queues an old queued/processing attempt whose job vanished from Redis", async () => {
    const repo = new FakeRepo([
      { id: "a-queued", status: "queued", updatedAt: OLD },
      { id: "b-processing", status: "processing", updatedAt: OLD },
    ]);
    const q = fakeQueue();
    const result = await sweepStuckAttempts(deps(repo, q.queue).deps, NOW);

    expect(q.requeued).toEqual(["a-queued", "b-processing"]);
    expect(result).toEqual({ requeued: 2, failed: 0 });
  });

  it("leaves recent, finished and not-yet-submitted attempts alone", async () => {
    const repo = new FakeRepo([
      { id: "fresh", status: "queued", updatedAt: minutesAgo(1) },
      { id: "done", status: "completed", updatedAt: OLD },
      { id: "broken", status: "failed", updatedAt: OLD },
      { id: "uploading", status: "awaiting_upload", updatedAt: OLD },
    ]);
    const q = fakeQueue();
    const result = await sweepStuckAttempts(deps(repo, q.queue).deps, NOW);

    expect(q.requeued).toEqual([]);
    expect(result).toEqual({ requeued: 0, failed: 0 });
  });

  it("doesn't touch an attempt whose job is still waiting, running or backing off", async () => {
    const repo = new FakeRepo([
      { id: "w", status: "queued", updatedAt: OLD },
      { id: "a", status: "processing", updatedAt: OLD },
    ]);
    const q = fakeQueue({ w: "alive", a: "alive" });
    const result = await sweepStuckAttempts(deps(repo, q.queue).deps, NOW);

    expect(q.requeued).toEqual([]);
    expect(repo.rows.map((r) => r.status)).toEqual(["queued", "processing"]);
    expect(result).toEqual({ requeued: 0, failed: 0 });
  });

  it("fails (and announces) an attempt whose job finished without saving a result", async () => {
    // e.g. BullMQ gave up on a job that stalled twice: the pipeline never ran its fail() step.
    const repo = new FakeRepo([{ id: "x", status: "processing", updatedAt: OLD }]);
    const q = fakeQueue({ x: "finished" });
    const d = deps(repo, q.queue);
    const result = await sweepStuckAttempts(d.deps, NOW);

    expect(q.requeued).toEqual([]);
    expect(repo.rows[0]).toMatchObject({ status: "failed", errorCode: "INTERNAL" });
    expect(d.announced).toEqual(["x"]);
    expect(result).toEqual({ requeued: 0, failed: 1 });
  });

  it("goes through every page, not just the first batch", async () => {
    const rows: Row[] = Array.from({ length: 250 }, (_, i) => ({
      id: `id-${String(i).padStart(3, "0")}`,
      status: "queued",
      updatedAt: OLD,
    }));
    const q = fakeQueue();
    const result = await sweepStuckAttempts(deps(new FakeRepo(rows), q.queue).deps, NOW);

    expect(result.requeued).toBe(250);
    expect(new Set(q.requeued).size).toBe(250);
  });
});

describe("toJobState", () => {
  it("maps BullMQ states to missing / alive / finished", () => {
    expect(toJobState("unknown")).toBe("missing");
    for (const s of ["waiting", "active", "delayed", "prioritized", "waiting-children"]) {
      expect(toJobState(s)).toBe("alive");
    }
    expect(toJobState("completed")).toBe("finished");
    expect(toJobState("failed")).toBe("finished");
  });
});

describe("startSweeper", () => {
  afterEach(() => vi.useRealTimers());

  it("sweeps at once, then on every interval, and reports errors instead of throwing", async () => {
    vi.useFakeTimers();
    const sweep = vi
      .fn()
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const stop = startSweeper({ sweep, intervalMs: 1000, onError });

    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "redis down" }));

    await vi.advanceTimersByTimeAsync(2000);
    expect(sweep).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sweep).toHaveBeenCalledTimes(3);
  });

  it("never runs two sweeps at the same time", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const sweep = vi.fn(() => new Promise<void>((r) => (release = r)));
    const stop = startSweeper({ sweep, intervalMs: 1000, onError: vi.fn() });

    await vi.advanceTimersByTimeAsync(3500); // three ticks while the first sweep hangs
    expect(sweep).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    stop();
  });
});
