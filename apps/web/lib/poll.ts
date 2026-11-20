/**
 * How the results page waits for the worker (SPEC §6.2, docs/scaling.md §2.2).
 *
 * Long-polling: each request asks the API to hold it up to RESULT_WAIT_S seconds, and the API
 * answers the moment the worker announces a change. So the result shows up as soon as it's
 * ready, and a 10 s wait costs one request instead of seven polls.
 *
 * If the API answered at once anyway (an older API, or a quick stage change), we fall back to
 * backing off: fast while a result is likely (most arrive in 5–10 s), then slower, because
 * the load test showed polls multiply exactly when the worker queue is busy.
 */
export const MAX_POLL_MS = 60_000;

/** Seconds the API may hold one results request (the API allows up to 25). */
export const RESULT_WAIT_S = 20;

/** A request that took this long was held by the API, not answered straight away. */
const HELD_MS = 1_000;

/**
 * Delay before the next request, given how long we've been waiting and how long the last
 * request took; false = stop.
 */
export function nextPollDelay(elapsedMs: number, lastRequestMs = 0): number | false {
  if (elapsedMs >= MAX_POLL_MS) return false;
  if (lastRequestMs >= HELD_MS) return 1; // the API already waited for us: ask again now
  if (elapsedMs < 10_000) return 1_500;
  if (elapsedMs < 30_000) return 3_000;
  return 5_000;
}
