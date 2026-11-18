/**
 * Low-level signal processing on mono PCM samples (Float32, −1…1). Pure functions, no I/O.
 *
 * Two measurements, both per short frame of audio:
 * - loudness (RMS level in dB) → silences, emphasis, trailing off;
 * - pitch (fundamental frequency, Hz) with the YIN algorithm → intonation / monotone.
 */

export const SAMPLE_RATE = 16_000;
/** 10 ms between frames: fine enough to time a 150 ms pause. */
export const HOP = 160;
/** 25 ms loudness window — the usual frame size for speech. */
const LEVEL_WINDOW = 400;

/** Level in dB of one frame per HOP. Frame k covers samples [k·HOP, k·HOP + window). */
export function frameLevels(samples: Float32Array): Float32Array {
  const count = Math.max(0, Math.floor((samples.length - LEVEL_WINDOW) / HOP) + 1);
  const out = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    let sum = 0;
    const start = k * HOP;
    for (let j = 0; j < LEVEL_WINDOW; j++) {
      const v = samples[start + j] ?? 0;
      sum += v * v;
    }
    // +1e-10 so digital silence is −100 dB, not −Infinity.
    out[k] = 10 * Math.log10(sum / LEVEL_WINDOW + 1e-10);
  }
  return out;
}

/** Time (s) of the centre of frame k. */
export const frameTime = (k: number): number => (k * HOP + LEVEL_WINDOW / 2) / SAMPLE_RATE;

/** p in 0…1. Sorts a copy; fine for a few thousand values. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? NaN;
}

export function median(values: ArrayLike<number>): number {
  return percentile(values, 0.5);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Human speaking pitch is roughly 75 Hz (low male) to 400 Hz (high female / excited).
const MIN_F0 = 75;
const MAX_F0 = 400;
const TAU_MIN = Math.floor(SAMPLE_RATE / MAX_F0); // shortest period we look for, in samples
const TAU_MAX = Math.ceil(SAMPLE_RATE / MIN_F0); // longest
const YIN_WINDOW = 512; // ≥ 2 of the longest periods
const YIN_THRESHOLD = 0.15;

/**
 * Pitch of the frame starting at `start` with YIN (de Cheveigné & Kawahara, 2002), or null when
 * the frame is unvoiced (silence, "s", "f"…).
 *
 * Idea: a voiced sound repeats every T samples. The difference d(τ) = Σ (x[j] − x[j+τ])² dips
 * to ~0 at τ = T. Normalizing it by its running mean ("CMND") removes the trivial dip at τ = 0,
 * and the FIRST τ below a threshold avoids octave errors (2T, 3T dip too).
 */
export function yinPitch(samples: Float32Array, start: number): number | null {
  if (start + YIN_WINDOW + TAU_MAX > samples.length) return null;
  const d = new Float32Array(TAU_MAX + 1);
  for (let tau = 1; tau <= TAU_MAX; tau++) {
    let sum = 0;
    for (let j = 0; j < YIN_WINDOW; j++) {
      const diff = (samples[start + j] ?? 0) - (samples[start + j + tau] ?? 0);
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalized difference.
  let running = 0;
  const cmnd = new Float32Array(TAU_MAX + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= TAU_MAX; tau++) {
    running += d[tau] ?? 0;
    cmnd[tau] = running === 0 ? 1 : ((d[tau] ?? 0) * tau) / running;
  }

  for (let tau = TAU_MIN; tau < TAU_MAX; tau++) {
    if ((cmnd[tau] ?? 1) < YIN_THRESHOLD) {
      // Walk down to the bottom of this dip.
      while (tau + 1 < TAU_MAX && (cmnd[tau + 1] ?? 1) < (cmnd[tau] ?? 1)) tau++;
      // Parabolic interpolation around the minimum for sub-sample accuracy.
      const a = cmnd[tau - 1] ?? 1;
      const b = cmnd[tau] ?? 1;
      const c = cmnd[tau + 1] ?? 1;
      const denom = a - 2 * b + c;
      const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
      return SAMPLE_RATE / (tau + shift);
    }
  }
  return null;
}
