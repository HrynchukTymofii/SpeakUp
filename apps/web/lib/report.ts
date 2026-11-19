import {
  VOICE_TARGETS,
  type Feedback,
  type FeedbackCategory,
  type Metrics,
  type Skill,
} from "@speakup/shared";

/**
 * Display helpers for the analysis report: labels and plain-language verdicts for numbers the
 * worker measured. No detection logic lives here; it only translates metrics into words.
 */

export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  pace: "Pace",
  pauses: "Pauses",
  fillers: "Filler words",
  clarity: "Clarity",
  accuracy: "Accuracy",
  structure: "Structure",
  voice: "Voice",
  content: "Content",
};

export const SKILL_LABEL: Record<Skill, string> = {
  pace: "Pace",
  pauses: "Pauses",
  fillers: "Filler words",
  voice: "Vocal variety",
  content: "Content",
  accuracy: "Accuracy",
};

/** Fixed display order, most "felt by the listener" first. */
const SKILL_ORDER: Skill[] = ["content", "voice", "pauses", "fillers", "pace", "accuracy"];

export function orderedSubscores(feedback: Feedback): { skill: Skill; score: number }[] {
  return [...(feedback.subscores ?? [])].sort(
    (a, b) => SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill),
  );
}

/** Pastel surface for a 0–100 score (pastels always carry dark ink). */
export function scoreSurface(score: number): string {
  if (score >= 75) return "bg-sage";
  if (score >= 55) return "bg-butter";
  return "bg-rose";
}

/** Voice numbers in words, or null when there is no trustworthy voice analysis. */
export function voiceVerdict(metrics: Metrics): { label: string; detail: string } | null {
  const v = metrics.voice;
  if (!v?.reliable) return null;
  const t = VOICE_TARGETS.pitchVariationSt;
  const label =
    v.pitchVariationSt < t.flat + 0.6
      ? "Monotone"
      : v.pitchVariationSt < t.lively
        ? "Some variety"
        : "Lively";
  const trailing =
    v.trailingOff.count > 0
      ? ` · ${v.trailingOff.count} of ${v.trailingOff.sentences} sentences fade out`
      : "";
  return { label, detail: `pitch moves ±${v.pitchVariationSt.toFixed(1)} semitones${trailing}` };
}

/** Read-aloud: "2 of 6 commas · 3 of 4 full stops", or null when not measured. */
export function punctuationSummary(
  metrics: Metrics,
): { honoredPct: number; detail: string } | null {
  const p = metrics.punctuation;
  if (!p) return null;
  const expected = p.commas.expected + p.sentenceEnds.expected;
  if (expected === 0) return null;
  const honored = p.commas.honored + p.sentenceEnds.honored;
  return {
    honoredPct: Math.round((honored / expected) * 100),
    detail: `${p.commas.honored} of ${p.commas.expected} commas · ${p.sentenceEnds.honored} of ${p.sentenceEnds.expected} full stops`,
  };
}

/** Free speech: hesitation pauses (searching for words), or long pauses for older analyses. */
export function hesitationSummary(metrics: Metrics): { count: number; detail: string } {
  const { hesitationCount, longCount, longestRunSec } = metrics.pauses;
  if (hesitationCount === undefined)
    return { count: longCount, detail: "long pauses (over 1.5 s)" };
  const run =
    longestRunSec !== undefined && longestRunSec > 12
      ? ` · ${longestRunSec.toFixed(0)} s without a breath`
      : "";
  return { count: hesitationCount, detail: `mid-sentence pauses${run}` };
}
