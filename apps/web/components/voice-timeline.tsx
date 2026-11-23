import type { Metrics } from "@speakup/shared";
import { clock, flattestNote } from "@/lib/report";
import {
  PITCH_LEGEND,
  pitchSlots,
  type Row,
  type Slot,
  type Tone,
  VOLUME_LEGEND,
  volumeSlots,
} from "@/lib/voice-chart";

const TONE_BG: Record<Tone, string> = {
  good: "bg-chart-good",
  warn: "bg-chart-warn",
  bad: "bg-chart-bad",
  neutral: "bg-dim",
};
const ROW_INDEX: Record<Row, number> = { high: 1, mid: 2, low: 3 };

/**
 * Pitch and volume across the take as colored bars, one per time slot: the row is the level
 * (high / mid / low, relative to the speaker's own voice) and the color says good or bad (see
 * lib/voice-chart.ts). Every color is named in a legend, so it never carries meaning alone.
 * Renders nothing without a reliable timeline (noisy recordings, or analyses saved before the
 * timeline existed).
 */
export function VoiceTimeline({ metrics }: { metrics: Metrics }) {
  const v = metrics.voice;
  if (!v?.reliable || !v.timeline) return null;
  const last = Math.max(v.timeline.pitch.at(-1)?.t ?? 0, v.timeline.loudness.at(-1)?.t ?? 0);
  const end = Math.max(metrics.totalSec, last, 1);
  const note = flattestNote(metrics);
  return (
    <div className="flex flex-col gap-5">
      <Chart
        kind="pitch"
        title="Pitch over time"
        range={`range ${v.pitchRangeSt.toFixed(1)} semitones`}
        slots={pitchSlots(v.timeline.pitch, end)}
        legend={PITCH_LEGEND}
        end={end}
        flat={v.flattest ?? null}
        note={note}
      />
      <Chart
        kind="volume"
        title="Volume over time"
        range={v.loudnessRangeDb !== undefined ? `range ${v.loudnessRangeDb.toFixed(1)} dB` : null}
        slots={volumeSlots(v.timeline.loudness, end)}
        legend={VOLUME_LEGEND}
        end={end}
        flat={null}
        note={null}
      />
    </div>
  );
}

function Chart({
  kind,
  title,
  range,
  slots,
  legend,
  end,
  flat,
  note,
}: {
  kind: "pitch" | "volume";
  title: string;
  range: string | null;
  slots: (Slot | null)[];
  legend: { tone: Tone; label: string }[];
  end: number;
  flat: { start: number; end: number } | null;
  note: string | null;
}) {
  const counts = legend.map(
    ({ tone, label }) => `${slots.filter((s) => s?.tone === tone).length} ${label.toLowerCase()}`,
  );
  const label = `${title}: ${[range, counts.join(", "), note?.toLowerCase()].filter(Boolean).join("; ")}`;
  const pct = (t: number) => `${(Math.min(end, Math.max(0, t)) / end) * 100}%`;

  return (
    <figure data-chart={kind} className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold text-ink">{title}</span>
        {range && <span className="text-muted tabular-nums">{range}</span>}
      </figcaption>

      <div className="grid grid-cols-[2.25rem_1fr] gap-2">
        <div aria-hidden className="grid h-24 grid-rows-3 py-1 text-[11px] leading-none text-muted">
          <span className="self-center">High</span>
          <span className="self-center">Mid</span>
          <span className="self-center">Low</span>
        </div>
        <div className="flex flex-col gap-1">
          <div
            role="img"
            aria-label={label}
            className="relative grid h-24 gap-[2px] rounded-xl bg-card-2 p-1"
            style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}
          >
            {/* Row guides. */}
            <span aria-hidden className="absolute inset-x-1 top-1/3 h-px bg-line" />
            <span aria-hidden className="absolute inset-x-1 top-2/3 h-px bg-line" />
            {slots.map((s, i) => (
              <div key={i} className="relative grid grid-rows-3 gap-[2px]">
                {s && (
                  <span
                    data-tone={s.tone}
                    data-row={s.row}
                    title={`${clock(s.start)}: ${s.label}`}
                    className={`rounded-[3px] ${TONE_BG[s.tone]}`}
                    style={{ gridRow: ROW_INDEX[s.row] }}
                  />
                )}
              </div>
            ))}
          </div>
          {flat && (
            <div aria-hidden className="relative mx-1 h-1.5">
              <span
                data-flattest
                className="absolute inset-y-0 rounded-full bg-chart-bad"
                style={{
                  left: pct(flat.start),
                  width: `calc(${pct(flat.end)} - ${pct(flat.start)})`,
                }}
              />
            </div>
          )}
          <div aria-hidden className="flex justify-between text-[11px] text-muted tabular-nums">
            <span>0:00</span>
            <span>{clock(end)}</span>
          </div>
        </div>
      </div>

      {note && (
        <p className="ml-11 text-sm font-semibold text-ink">
          {note} <span className="font-medium text-muted">(red line)</span>
        </p>
      )}
      <ul aria-hidden className="ml-11 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {legend.map(({ tone, label }) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-[3px] ${TONE_BG[tone]}`} />
            {label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
