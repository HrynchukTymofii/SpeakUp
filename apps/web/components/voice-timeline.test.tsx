// @vitest-environment jsdom
import type { Metrics, VoiceMetrics } from "@speakup/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VoiceTimeline } from "./voice-timeline";

const points = (vs: number[]) => vs.map((v, i) => ({ t: i * 0.5 + 0.2, v }));

const voice: VoiceMetrics = {
  reliable: true,
  pitchVariationSt: 2.1,
  pitchRangeSt: 5.2,
  loudnessVariationDb: 3,
  paceVariationPct: 12,
  trailingOff: { count: 0, sentences: 4, list: [] },
  loudnessRangeDb: 7.4,
  timeline: {
    pitch: points([0, 3, -2, 4, 0, 0, 0.2, -0.1, 0, 2]),
    loudness: points([0, 4, -3, 1, -6, -4, 2, 0, -1, 0]),
  },
  flattest: { start: 2, end: 4, pitchVariationSt: 0.1 },
};

const metrics = (v: VoiceMetrics | null): Metrics => ({
  durationSec: 5,
  totalSec: 6,
  wordCount: 12,
  wpm: 140,
  wpmTarget: { min: 130, max: 160 },
  pauses: { count: 0, longCount: 0, longestSec: 0, list: [] },
  fillers: { count: 0, perMinute: 0, list: [] },
  lowConfidenceWords: [],
  readAloud: null,
  voice: v,
});

describe("VoiceTimeline", () => {
  it("charts pitch and volume over time, with their ranges", () => {
    render(<VoiceTimeline metrics={metrics(voice)} />);
    expect(screen.getByRole("img", { name: /pitch over time/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /volume over time/i })).toBeInTheDocument();
    expect(screen.getByText(/5\.2 semitones/)).toBeInTheDocument();
    expect(screen.getByText(/7\.4 dB/)).toBeInTheDocument();
  });

  it("draws one colored bar per second with speech, and a legend for the colors", () => {
    // Points run 0.2–4.7 s of a 6 s take: 1 s slots, the last one empty.
    const { container } = render(<VoiceTimeline metrics={metrics(voice)} />);
    const pitch = container.querySelector('[data-chart="pitch"]');
    const volume = container.querySelector('[data-chart="volume"]');
    expect(pitch?.querySelectorAll("[data-tone]")).toHaveLength(5);
    expect(volume?.querySelectorAll("[data-tone]")).toHaveLength(5);
    // Volume at 2–3 s averages 5 dB under the median: that bar is "quiet" (bad) in the low row.
    expect(volume?.querySelector('[data-row="low"][data-tone="bad"]')).not.toBeNull();
    for (const label of ["Lively", "Some movement", "Flat", "Stressed", "Steady", "Quiet"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the most monotone stretch on the pitch chart and names its time", () => {
    const { container } = render(<VoiceTimeline metrics={metrics(voice)} />);
    expect(screen.getByText("Most monotone at 0:02–0:04")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-flattest]")).toHaveLength(1);
  });

  it("has no marker when no stretch was flat", () => {
    const { container } = render(<VoiceTimeline metrics={metrics({ ...voice, flattest: null })} />);
    expect(screen.queryByText(/most monotone/i)).toBeNull();
    expect(container.querySelector("[data-flattest]")).toBeNull();
  });

  it("renders nothing for noisy recordings or analyses saved before the timeline", () => {
    const noisy = render(<VoiceTimeline metrics={metrics({ ...voice, reliable: false })} />);
    expect(noisy.container).toBeEmptyDOMElement();
    const old = render(<VoiceTimeline metrics={metrics({ ...voice, timeline: undefined })} />);
    expect(old.container).toBeEmptyDOMElement();
  });
});
