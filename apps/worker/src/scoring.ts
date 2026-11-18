import { RUN_ON_SEC, VOICE_TARGETS, type Metrics, type Skill } from "@speakup/shared";

/**
 * The overall score, computed by our code from the metrics — not picked by the LLM.
 *
 * Why: an LLM asked for "a score out of 100" is generous and inconsistent (a clean read-aloud
 * got 95, which left nothing to practice). Rule-based subscores are repeatable, can be
 * explained ("pauses: 4 of 9 commas"), and are tuned in one place. The LLM contributes one
 * judgement only it can make: the content score (relevance, structure, repetition).
 *
 * Calibration intent: a typical untrained speaker lands around 55–70, a good one 75–85, and
 * 90+ needs every skill to be strong. Tune the numbers below on real recordings.
 */

export type Subscores = Partial<Record<Skill, number>>;

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
/** Linear 0→1 between `bad` and `good` (either order). */
const scale = (v: number, bad: number, good: number) => clamp((v - bad) / (good - bad), 0, 1);

const WEIGHTS: Record<"free_speech" | "read_aloud", Partial<Record<Skill, number>>> = {
  free_speech: { content: 0.3, voice: 0.2, pauses: 0.2, fillers: 0.15, pace: 0.15 },
  read_aloud: { pauses: 0.3, voice: 0.25, accuracy: 0.2, pace: 0.15, fillers: 0.1 },
};

export function paceScore(m: Metrics): number {
  const { wpm, wpmTarget } = m;
  const off = wpm < wpmTarget.min ? wpmTarget.min - wpm : Math.max(0, wpm - wpmTarget.max);
  return clamp(100 - off * 1.2, 20);
}

export function fillerScore(m: Metrics): number {
  return clamp(100 - Math.max(0, m.fillers.perMinute - 1) * 10, 15);
}

/** Free speech: hesitations, long silences, and talking on without a breath. */
export function pauseScore(m: Metrics, durationMin: number): number {
  const hesitationsPerMin = (m.pauses.hesitationCount ?? 0) / Math.max(durationMin, 0.25);
  const runOn = Math.max(0, (m.pauses.longestRunSec ?? 0) - RUN_ON_SEC);
  return clamp(100 - hesitationsPerMin * 6 - m.pauses.longCount * 8 - runOn * 3, 15);
}

/** Read-aloud: share of commas and sentence ends with an audible pause (ends weigh double). */
export function punctuationScore(m: Metrics): number | null {
  const p = m.punctuation;
  if (!p) return null;
  const expected = p.commas.expected + 2 * p.sentenceEnds.expected;
  if (expected === 0) return null;
  const honored = p.commas.honored + 2 * p.sentenceEnds.honored;
  return clamp((honored / expected) * 100 - m.pauses.longCount * 8, 10);
}

export function voiceScore(m: Metrics): number | null {
  const v = m.voice;
  if (!v?.reliable) return null;
  const t = VOICE_TARGETS;
  const pitch = scale(v.pitchVariationSt, t.pitchVariationSt.flat, t.pitchVariationSt.lively);
  const loud = scale(
    v.loudnessVariationDb,
    t.loudnessVariationDb.flat,
    t.loudnessVariationDb.lively,
  );
  const trailing =
    v.trailingOff.sentences > 0 ? 1 - v.trailingOff.count / v.trailingOff.sentences : 1;
  const parts: [number, number][] = [
    [pitch, 0.45],
    [loud, 0.3],
    [trailing, 0.1],
  ];
  if (v.paceVariationPct !== null) {
    parts.push([
      scale(v.paceVariationPct, t.paceVariationPct.flat, t.paceVariationPct.lively),
      0.15,
    ]);
  }
  const weight = parts.reduce((a, [, w]) => a + w, 0);
  // Floor at 25: even a flat voice delivered the words.
  return 25 + 75 * (parts.reduce((a, [v, w]) => a + v * w, 0) / weight);
}

/** Reading accuracy: each missed or changed percent costs 3 points (95 % → 85). */
export function accuracyScore(m: Metrics): number | null {
  return m.readAloud ? clamp(100 - (100 - m.readAloud.accuracyPct) * 3) : null;
}

/** Everything except content (which needs the LLM). Skills we can't measure are left out. */
export function computeSubscores(m: Metrics, type: "free_speech" | "read_aloud"): Subscores {
  const durationMin = m.durationSec / 60;
  const scores: Subscores = {
    pace: paceScore(m),
    fillers: fillerScore(m),
    pauses:
      type === "read_aloud"
        ? (punctuationScore(m) ?? pauseScore(m, durationMin))
        : pauseScore(m, durationMin),
  };
  const voice = voiceScore(m);
  if (voice !== null) scores.voice = voice;
  const accuracy = accuracyScore(m);
  if (type === "read_aloud" && accuracy !== null) scores.accuracy = accuracy;
  return scores;
}

/** Weighted mean over the skills we have (weights renormalized when one is missing). */
export function overallScore(subscores: Subscores, type: "free_speech" | "read_aloud"): number {
  let sum = 0;
  let weight = 0;
  for (const [skill, w] of Object.entries(WEIGHTS[type]) as [Skill, number][]) {
    const s = subscores[skill];
    if (s === undefined) continue;
    sum += s * w;
    weight += w;
  }
  return weight === 0 ? 0 : Math.round(sum / weight);
}

export function toSubscoreList(subscores: Subscores): { skill: Skill; score: number }[] {
  return (Object.entries(subscores) as [Skill, number][]).map(([skill, score]) => ({
    skill,
    score: Math.round(score),
  }));
}
