import { describe, expect, it, vi } from "vitest";
import { withChangeEvents } from "./attempt-events.js";
import type { AnalysisRepo } from "./repo.js";

function fakeRepo(): AnalysisRepo {
  return {
    load: vi.fn(async () => null),
    markProcessing: vi.fn(async () => {}),
    saveTranscript: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
}
const log = { warn: vi.fn() };

describe("withChangeEvents", () => {
  it("announces every status change after it is saved", async () => {
    const order: string[] = [];
    const repo = fakeRepo();
    vi.mocked(repo.complete).mockImplementation(async () => {
      order.push("saved");
    });
    const publish = vi.fn(async (id: string) => {
      order.push(`published ${id}`);
    });
    const wrapped = withChangeEvents(repo, publish, log);

    await wrapped.markProcessing("a1");
    await wrapped.saveTranscript("a1", { provider: "x", text: "hi", words: [] });
    await wrapped.complete("a1", {} as never);
    await wrapped.fail("a2", "NO_SPEECH");

    expect(publish.mock.calls.map((c) => c[0])).toEqual(["a1", "a1", "a1", "a2"]);
    // The waiting API re-reads the DB on the event, so the write must land first.
    expect(order).toEqual([
      "published a1",
      "published a1",
      "saved",
      "published a1",
      "published a2",
    ]);
  });

  it("doesn't announce reads or failed writes", async () => {
    const repo = fakeRepo();
    vi.mocked(repo.complete).mockRejectedValue(new Error("db down"));
    const publish = vi.fn(async () => {});
    const wrapped = withChangeEvents(repo, publish, log);

    await wrapped.load("a1");
    await expect(wrapped.complete("a1", {} as never)).rejects.toThrow("db down");
    expect(publish).not.toHaveBeenCalled();
  });

  it("a failed announcement never fails the job (clients still get the result on their next request)", async () => {
    const publish = vi.fn(async () => {
      throw new Error("redis down");
    });
    const wrapped = withChangeEvents(fakeRepo(), publish, log);
    await expect(wrapped.complete("a1", {} as never)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });
});
