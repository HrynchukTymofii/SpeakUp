import type { Redis } from "ioredis";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  createInMemoryKeyedLock,
  createRedisKeyedLock,
  LockTimeoutError,
  type KeyedLock,
} from "./user-lock.js";

/** Just the two commands the lock uses, with Redis semantics (NX, token-checked delete). */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      async set(key: string, value: string, _px: "PX", _ttl: number, _nx: "NX") {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
      async eval(_script: string, _n: number, key: string, token: string) {
        if (store.get(key) !== token) return 0;
        store.delete(key);
        return 1;
      },
    } as unknown as Redis,
  };
}

/** Starts `n` overlapping critical sections; returns the max that ever ran at once. */
async function maxConcurrency(lock: KeyedLock, key: string, n: number) {
  let inside = 0;
  let max = 0;
  await Promise.all(
    Array.from({ length: n }, () =>
      lock.run(key, async () => {
        inside++;
        max = Math.max(max, inside);
        await delay(5);
        inside--;
      }),
    ),
  );
  return max;
}

describe.each([
  ["in-memory", () => createInMemoryKeyedLock()],
  ["redis", () => createRedisKeyedLock(fakeRedis().redis, { retryMs: 1 })],
])("%s keyed lock", (_name, make) => {
  it("lets only one caller per key run at a time", async () => {
    expect(await maxConcurrency(make(), "quota:user_1", 8)).toBe(1);
  });

  it("does not block different keys", async () => {
    const lock = make();
    const order: string[] = [];
    await Promise.all([
      lock.run("a", async () => {
        await delay(20);
        order.push("a");
      }),
      lock.run("b", async () => {
        order.push("b");
      }),
    ]);
    expect(order).toEqual(["b", "a"]);
  });

  it("releases the lock when the function throws", async () => {
    const lock = make();
    await expect(
      lock.run("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(lock.run("k", async () => "next")).resolves.toBe("next");
  });
});

describe("redis keyed lock", () => {
  it("gives up with LockTimeoutError when the key stays taken", async () => {
    const { redis, store } = fakeRedis();
    store.set("lock:busy", "someone-else");
    const lock = createRedisKeyedLock(redis, { waitMs: 20, retryMs: 5 });
    await expect(lock.run("busy", async () => "never")).rejects.toBeInstanceOf(LockTimeoutError);
    expect(store.get("lock:busy")).toBe("someone-else"); // never deletes another holder's lock
  });
});
