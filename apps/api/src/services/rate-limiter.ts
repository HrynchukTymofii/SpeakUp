import type { Redis } from "ioredis";

/** Fixed-window counter: "at most `limit` hits per `windowSec` for this key". */
export interface RateLimiter {
  /** Counts one hit. Returns false if this hit is over the limit. */
  hit(key: string, limit: number, windowSec: number): Promise<boolean>;
}

/**
 * Redis-backed, so the limit holds across all API instances (an in-memory counter would give
 * each container its own limit). INCR is atomic: two simultaneous requests can't both read
 * "2" and both pass a limit of 3. EXPIRE NX sets the window only on the first hit.
 */
export function createRedisRateLimiter(redis: Redis): RateLimiter {
  return {
    async hit(key, limit, windowSec) {
      const redisKey = `ratelimit:${key}`;
      // MULTI: both commands run together, so a crash can't leave a counter without expiry.
      const results = await redis.multi().incr(redisKey).expire(redisKey, windowSec, "NX").exec();
      const [incrError, count] = results?.[0] ?? [new Error("rate limiter: empty MULTI result")];
      if (incrError) throw incrError;
      return Number(count) <= limit;
    },
  };
}
