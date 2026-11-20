import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Redis } from "ioredis";

/**
 * Runs a function while holding a lock on `key`, so check-then-act sequences ("count today's
 * attempts, then insert one") can't interleave for the same key. Found by the quota-race load
 * test (docs/load-testing.md, run 4): 10 parallel creates against a quota of 3 let 6 through.
 */
export interface KeyedLock {
  /** Rejects with LockTimeoutError if the lock can't be taken within the wait budget. */
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export class LockTimeoutError extends Error {
  constructor(key: string) {
    super(`could not acquire lock ${key}`);
    this.name = "LockTimeoutError";
  }
}

/** Deletes the key only if it still holds our token (the lock may have expired and moved on). */
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Redis lock (SET NX PX + token), shared by every API task. The TTL bounds how long a crashed
 * holder can block others; the protected section is two short queries, far below it.
 */
export function createRedisKeyedLock(
  redis: Redis,
  opts: { ttlMs?: number; waitMs?: number; retryMs?: number } = {},
): KeyedLock {
  const ttlMs = opts.ttlMs ?? 5_000;
  const waitMs = opts.waitMs ?? 3_000;
  const retryMs = opts.retryMs ?? 25;

  return {
    async run(key, fn) {
      const redisKey = `lock:${key}`;
      const token = randomUUID();
      const deadline = Date.now() + waitMs;
      while ((await redis.set(redisKey, token, "PX", ttlMs, "NX")) !== "OK") {
        if (Date.now() >= deadline) throw new LockTimeoutError(key);
        await delay(retryMs);
      }
      try {
        return await fn();
      } finally {
        await redis.eval(RELEASE, 1, redisKey, token);
      }
    },
  };
}

/** Single-process version (tests): a promise chain per key. */
export function createInMemoryKeyedLock(): KeyedLock {
  const tails = new Map<string, Promise<unknown>>();
  return {
    async run(key, fn) {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(fn, fn);
      const tail = result.catch(() => undefined);
      tails.set(key, tail);
      try {
        return await result;
      } finally {
        if (tails.get(key) === tail) tails.delete(key);
      }
    },
  };
}
