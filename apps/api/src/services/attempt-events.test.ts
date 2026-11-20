import { describe, expect, it } from "vitest";
import { createAttemptEventHub, handleAttemptEventMessage } from "./attempt-events.js";

describe("attempt event hub", () => {
  it("wakes a waiting request when its attempt changes", async () => {
    const hub = createAttemptEventHub();
    const waiting = hub.waitForChange("a1", 5_000);
    hub.notify("a1");
    await expect(waiting).resolves.toBe(true);
    expect(hub.waitingCount()).toBe(0);
  });

  it("ignores other attempts and gives up after the timeout", async () => {
    const hub = createAttemptEventHub();
    const waiting = hub.waitForChange("a1", 20);
    hub.notify("a2");
    await expect(waiting).resolves.toBe(false);
    expect(hub.waitingCount()).toBe(0);
  });

  it("stops waiting when the client disconnects", async () => {
    const hub = createAttemptEventHub();
    const ac = new AbortController();
    const waiting = hub.waitForChange("a1", 5_000, ac.signal);
    ac.abort();
    await expect(waiting).resolves.toBe(false);
    expect(hub.waitingCount()).toBe(0);
  });

  it("wakes every request waiting on the same attempt (two tabs)", async () => {
    const hub = createAttemptEventHub();
    const both = Promise.all([hub.waitForChange("a1", 5_000), hub.waitForChange("a1", 5_000)]);
    hub.notify("a1");
    await expect(both).resolves.toEqual([true, true]);
  });
});

describe("handleAttemptEventMessage", () => {
  it("notifies for a valid message and ignores junk", () => {
    const seen: string[] = [];
    const hub = { notify: (id: string) => seen.push(id) };
    handleAttemptEventMessage(hub, JSON.stringify({ attemptId: "a1" }));
    handleAttemptEventMessage(hub, "not json");
    handleAttemptEventMessage(hub, JSON.stringify({ attemptId: 5 }));
    expect(seen).toEqual(["a1"]);
  });
});
