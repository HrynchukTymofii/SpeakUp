import type { AnalysisRepo } from "./repo.js";

/** Announces that an attempt changed (Redis pub/sub in prod, see ATTEMPT_EVENTS_CHANNEL). */
export type PublishAttemptChanged = (attemptId: string) => Promise<void>;

/**
 * Wraps the repo so every saved status change is announced to API tasks waiting on that attempt
 * (long-polling results page). Announced after the write, because the API re-reads the DB when
 * woken. A failed announcement is only logged: the waiting request times out and the browser
 * asks again, so the user still gets the result, just later.
 */
export function withChangeEvents(
  repo: AnalysisRepo,
  publish: PublishAttemptChanged,
  log: { warn: (obj: object, msg: string) => void },
): AnalysisRepo {
  const announce = async (attemptId: string) => {
    try {
      await publish(attemptId);
    } catch (err) {
      log.warn({ attemptId, err: (err as Error).message }, "could not announce attempt change");
    }
  };
  return {
    load: (attemptId) => repo.load(attemptId),
    markProcessing: async (attemptId) => {
      await repo.markProcessing(attemptId);
      await announce(attemptId);
    },
    saveTranscript: async (attemptId, t) => {
      await repo.saveTranscript(attemptId, t);
      await announce(attemptId);
    },
    complete: async (attemptId, analysis) => {
      await repo.complete(attemptId, analysis);
      await announce(attemptId);
    },
    fail: async (attemptId, code) => {
      await repo.fail(attemptId, code);
      await announce(attemptId);
    },
  };
}
