import { VOICE_TARGETS, type TimelinePoint } from "@speakup/shared";

/**
 * Turns the per-word voice timeline into time slots for the Energy charts. One point per word is
 * too jumpy to read, so each slot shows one bar: its ROW is the average level (high / mid /
 * low) and its COLOR says whether that is good or bad. No measuring happens here.
 */

export type Row = "high" | "mid" | "low";
export type Tone = "good" | "warn" | "bad" | "neutral";
export interface Slot {
  start: number;
  end: number;
  row: Row;
  tone: Tone;
  label: string;
}

/** Short takes get 1 s slots; long ones are capped so the bars stay wide enough to see. */
const MAX_SLOTS = 40;
/** Pitch movement is judged over this many seconds each side of a slot's center. */
const MOVEMENT_WINDOW_SEC = 1.5;
/** Beyond ±this a slot sits in the high or low row (semitones / dB from the speaker's median). */
const PITCH_BAND_ST = 2;
const VOLUME_BAND_DB = 3;

type Mark = { tone: Tone; label: string };
const LIVELY: Mark = { tone: "good", label: "Lively" };
const SOME: Mark = { tone: "warn", label: "Some movement" };
const FLAT: Mark = { tone: "bad", label: "Flat" };
const STRESSED: Mark = { tone: "good", label: "Stressed" };
const STEADY: Mark = { tone: "neutral", label: "Steady" };
const QUIET: Mark = { tone: "bad", label: "Quiet" };

export const PITCH_LEGEND: Mark[] = [LIVELY, SOME, FLAT];
export const VOLUME_LEGEND: Mark[] = [STRESSED, STEADY, QUIET];

export function slotSeconds(end: number): number {
  return Math.max(1, end / MAX_SLOTS);
}

/**
 * Pitch: a low or high voice isn't good or bad in itself, a voice that doesn't move is. So the
 * row shows the level and the color shows how much the pitch moved around that moment, with
 * the same cut-offs as the overall verdict.
 */
export function pitchSlots(points: TimelinePoint[], end: number): (Slot | null)[] {
  return slots(points, end, PITCH_BAND_ST, (center) => {
    let near = points.filter((p) => Math.abs(p.t - center) <= MOVEMENT_WINDOW_SEC);
    // Few words nearby (slow speech): look a little wider rather than judge on one or two.
    if (near.length < 3)
      near = points.filter((p) => Math.abs(p.t - center) <= 2 * MOVEMENT_WINDOW_SEC);
    const sd = stdDev(near.map((p) => p.v));
    if (sd < VOICE_TARGETS.monotoneSt) return FLAT;
    return sd < VOICE_TARGETS.pitchVariationSt.lively ? SOME : LIVELY;
  });
}

/** Volume: louder than usual is emphasis (good), normal is fine, much quieter is fading (bad). */
export function volumeSlots(points: TimelinePoint[], end: number): (Slot | null)[] {
  return slots(points, end, VOLUME_BAND_DB, (_center, row) =>
    row === "high" ? STRESSED : row === "mid" ? STEADY : QUIET,
  );
}

function slots(
  points: TimelinePoint[],
  end: number,
  band: number,
  judge: (center: number, row: Row) => Mark,
): (Slot | null)[] {
  const size = slotSeconds(end);
  const count = Math.ceil(end / size - 1e-9);
  return Array.from({ length: count }, (_, i) => {
    const start = i * size;
    const slotEnd = start + size;
    const inside = points.filter((p) => p.t >= start && p.t < slotEnd);
    if (inside.length === 0) return null;
    const level = inside.reduce((a, p) => a + p.v, 0) / inside.length;
    const row: Row = level > band ? "high" : level < -band ? "low" : "mid";
    return { start, end: slotEnd, row, ...judge(start + size / 2, row) };
  });
}

function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}
