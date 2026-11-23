import type { TimelinePoint } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { pitchSlots, slotSeconds, volumeSlots } from "./voice-chart";

/** One point every 0.25 s from `from` to `to` (exclusive), value from `v(i)`. */
function run(from: number, to: number, v: (i: number) => number): TimelinePoint[] {
  const out: TimelinePoint[] = [];
  for (let i = 0, t = from; t < to; i++, t = from + i * 0.25) out.push({ t, v: v(i) });
  return out;
}

describe("voice chart slots", () => {
  it("uses 1 s slots for short takes and caps long takes at 40 slots", () => {
    expect(slotSeconds(10)).toBe(1);
    expect(slotSeconds(64)).toBe(1.6);
    expect(pitchSlots([], 64)).toHaveLength(40);
  });

  it("leaves a gap where nobody spoke", () => {
    const slots = pitchSlots(
      run(0, 2, () => 0),
      4,
    );
    expect(slots[0]).not.toBeNull();
    expect(slots[3]).toBeNull();
  });

  it("pitch: the row follows the level, the color follows how much it moves", () => {
    // 0–4 s on one note (flat), 4–8 s jumping ±4 semitones (lively), 8–12 s a little higher.
    const points = [
      ...run(0, 4, () => 0),
      ...run(4, 8, (i) => (i % 2 ? 4 : -4)),
      ...run(8, 12, (i) => 3 + (i % 2 ? 2 : -2)),
    ];
    const slots = pitchSlots(points, 12);
    expect(slots[1]).toMatchObject({ row: "mid", tone: "bad", label: "Flat" });
    expect(slots[5]).toMatchObject({ tone: "good", label: "Lively" });
    expect(slots[10]).toMatchObject({ row: "high", tone: "warn", label: "Some movement" });
  });

  it("volume: quiet is bad, stressed is good, normal volume is neutral", () => {
    const points = [...run(0, 1, () => -6), ...run(1, 2, () => 0), ...run(2, 3, () => 5)];
    const [quiet, steady, stressed] = volumeSlots(points, 3);
    expect(quiet).toMatchObject({ row: "low", tone: "bad", label: "Quiet" });
    expect(steady).toMatchObject({ row: "mid", tone: "neutral", label: "Steady" });
    expect(stressed).toMatchObject({ row: "high", tone: "good", label: "Stressed" });
  });
});
