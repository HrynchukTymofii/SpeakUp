import { ATTEMPT_EVENTS_CHANNEL, AttemptChangedEventSchema } from "@speakup/shared";
import type { Redis } from "ioredis";

/**
 * Lets a request wait until the worker changes an attempt (long-polling, docs/scaling.md §2.2).
 * Instead of the results page asking "done yet?" every few seconds, it asks once with
 * `?wait=20`, and the API answers the moment the worker announces a change.
 */
export interface AttemptEvents {
  /** true when the attempt changed; false on timeout or when `signal` aborts (client left). */
  waitForChange(attemptId: string, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
}

export interface AttemptEventHub extends AttemptEvents {
  notify(attemptId: string): void;
  /** Requests currently waiting (tests, and a leak check). */
  waitingCount(): number;
}

/** In-process registry of waiting requests. Each API task has one, fed by Redis pub/sub. */
export function createAttemptEventHub(): AttemptEventHub {
  const waiting = new Map<string, Set<(changed: boolean) => void>>();
  let count = 0;

  return {
    waitForChange(attemptId, timeoutMs, signal) {
      return new Promise<boolean>((resolve) => {
        if (signal?.aborted) return resolve(false);
        const finish = (changed: boolean) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          const set = waiting.get(attemptId);
          if (set?.delete(finish)) count--;
          if (set?.size === 0) waiting.delete(attemptId);
          resolve(changed);
        };
        const onAbort = () => finish(false);
        const timer = setTimeout(() => finish(false), timeoutMs);
        signal?.addEventListener("abort", onAbort, { once: true });
        let set = waiting.get(attemptId);
        if (!set) waiting.set(attemptId, (set = new Set()));
        set.add(finish);
        count++;
      });
    },
    notify(attemptId) {
      for (const finish of [...(waiting.get(attemptId) ?? [])]) finish(true);
    },
    waitingCount: () => count,
  };
}

/** Validates a pub/sub message (a Redis boundary) and wakes the matching requests. */
export function handleAttemptEventMessage(hub: Pick<AttemptEventHub, "notify">, message: string) {
  let data: unknown;
  try {
    data = JSON.parse(message);
  } catch {
    return;
  }
  const parsed = AttemptChangedEventSchema.safeParse(data);
  if (parsed.success) hub.notify(parsed.data.attemptId);
}

/**
 * Subscribes `subscriber` (a dedicated connection: a subscribed ioredis client can't run other
 * commands) to the worker's announcements. Every API task gets every announcement and wakes
 * only the requests it holds itself, so any task can serve any waiting browser.
 */
export async function createRedisAttemptEvents(subscriber: Redis): Promise<AttemptEventHub> {
  const hub = createAttemptEventHub();
  subscriber.on("message", (channel: string, message: string) => {
    if (channel === ATTEMPT_EVENTS_CHANNEL) handleAttemptEventMessage(hub, message);
  });
  await subscriber.subscribe(ATTEMPT_EVENTS_CHANNEL);
  return hub;
}
