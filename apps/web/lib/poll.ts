/**
 * How often the results page asks "is it done yet?" (SPEC §6.2).
 *
 * The load test (docs/load-testing.md) showed polls are most of the API's traffic, and that
 * they multiply exactly when the worker queue is busy: everyone waits longer and keeps asking.
 * So poll fast while a result is likely (most arrive in 5–10 s), then back off. Push (SSE /
 * mobile notifications) replaces this later (docs/scaling.md).
 */
export const MAX_POLL_MS = 60_000;

/** Delay before the next poll, given how long we've been waiting; false = stop. */
export function nextPollDelay(elapsedMs: number): number | false {
  if (elapsedMs >= MAX_POLL_MS) return false;
  if (elapsedMs < 10_000) return 1_500;
  if (elapsedMs < 30_000) return 3_000;
  return 5_000;
}
