import { z } from "zod";
import { RUN_ON_SEC, VOICE_TARGETS, WPM_TARGET, type Feedback, type Metrics } from "./analysis.js";

/**
 * Concrete speaking problems, detected from the measured metrics (plus the feedback's structure
 * verdict). Finer than `FeedbackCategory`: "voice" alone can't say whether to practice emphasis,
 * pace changes or strong endings, but each of these maps to exactly one lesson in the app.
 *
 * Detection is deterministic (no LLM) so the same recording always recommends the same lessons.
 */
export const ProblemSchema = z.enum([
  "fillers",
  "hesitations",
  "skipped-punctuation",
  "run-on",
  "too-fast",
  "monotone",
  "flat-pace",
  "trailing-off",
  "hedges",
  "structure",
]);
export type Problem = z.infer<typeof ProblemSchema>;

/**
 * Thresholds. Deliberately a little stricter than "bad": a lesson suggestion is cheap, and a
 * user who is close to the line still benefits from the drill. Tune on real recordings.
 */
export const PROBLEM_THRESHOLDS = {
  fillersPerMinute: 2,
  hesitationsPerMinute: 2,
  longPauses: 2,
  /** Share of read-aloud punctuation marks that got an audible pause. */
  punctuationHonoredShare: 0.7,
  tooFastOverTargetWpm: 15,
  trailingOffShare: 0.3,
  hedges: 2,
} as const;

/** Problems in one analyzed attempt, in a stable order (the order of `ProblemSchema`). */
export function detectProblems(metrics: Metrics, feedback: Feedback): Problem[] {
  const t = PROBLEM_THRESHOLDS;
  const found = new Set<Problem>();
  const minutes = Math.max(metrics.durationSec / 60, 0.25);

  if (metrics.fillers.count >= 2 && metrics.fillers.perMinute >= t.fillersPerMinute) {
    found.add("fillers");
  }

  const hesitations = metrics.pauses.hesitationCount ?? 0;
  if (
    (hesitations >= 2 && hesitations / minutes >= t.hesitationsPerMinute) ||
    metrics.pauses.longCount >= t.longPauses
  ) {
    found.add("hesitations");
  }

  const p = metrics.punctuation;
  if (p) {
    const expected = p.commas.expected + p.sentenceEnds.expected;
    const honored = p.commas.honored + p.sentenceEnds.honored;
    if (expected >= 3 && honored / expected < t.punctuationHonoredShare) {
      found.add("skipped-punctuation");
    }
  }

  if ((metrics.pauses.longestRunSec ?? 0) > RUN_ON_SEC) found.add("run-on");
  if (metrics.wpm > WPM_TARGET.max + t.tooFastOverTargetWpm) found.add("too-fast");

  const v = metrics.voice;
  if (v?.reliable) {
    if (
      v.pitchVariationSt < VOICE_TARGETS.pitchVariationSt.flat ||
      v.loudnessVariationDb < VOICE_TARGETS.loudnessVariationDb.flat
    ) {
      found.add("monotone");
    }
    if (v.paceVariationPct !== null && v.paceVariationPct < VOICE_TARGETS.paceVariationPct.flat) {
      found.add("flat-pace");
    }
    const { count, sentences } = v.trailingOff;
    if (count >= 1 && sentences > 0 && count / sentences >= t.trailingOffShare) {
      found.add("trailing-off");
    }
  }

  if ((metrics.language?.hedges.count ?? 0) >= t.hedges) found.add("hedges");

  if (feedback.issues.some((i) => i.category === "structure" && i.severity !== "low")) {
    found.add("structure");
  }

  return ProblemSchema.options.filter((problem) => found.has(problem));
}
