import type { Metrics, TimelinePoint } from "@speakup/shared";
import { clock, flattestNote } from "@/lib/report";

const W = 300;
const H = 72;
/** Keeps the line off the top and bottom edge. */
const PAD_Y = 4;

interface ChartSpec {
  title: string;
  unit: string;
  /** Values beyond ±limit are drawn at the edge (one shouted word shouldn't flatten the rest). */
  limit: number;
  /** Beyond ±band a word counts as high / low: the shaded bands. */
  band: number;
  range: number | undefined;
}

const PITCH: Omit<ChartSpec, "range"> = {
  title: "Pitch over time",
  unit: "semitones",
  limit: 8,
  band: 2,
};
const VOLUME: Omit<ChartSpec, "range"> = {
  title: "Volume over time",
  unit: "dB",
  limit: 10,
  band: 3,
};

/**
 * Pitch and volume across the take, one point per word, relative to the speaker's own median.
 * A flat line is what "monotone" looks like; the most monotone stretch is shaded so the user
 * sees where, not only how much. Renders nothing without a reliable timeline (noisy
 * recordings, or analyses saved before the timeline existed).
 */
export function VoiceTimeline({ metrics }: { metrics: Metrics }) {
  const v = metrics.voice;
  if (!v?.reliable || !v.timeline) return null;
  const last = Math.max(v.timeline.pitch.at(-1)?.t ?? 0, v.timeline.loudness.at(-1)?.t ?? 0);
  const end = Math.max(metrics.totalSec, last, 1);
  const note = flattestNote(metrics);
  return (
    <div className="flex flex-col gap-4">
      <Chart
        spec={{ ...PITCH, range: v.pitchRangeSt }}
        points={v.timeline.pitch}
        end={end}
        flat={v.flattest ?? null}
        summary={note}
      />
      {note && (
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden className="size-3 shrink-0 rounded-[4px] bg-butter" />
          {note}
        </p>
      )}
      <Chart
        spec={{ ...VOLUME, range: v.loudnessRangeDb }}
        points={v.timeline.loudness}
        end={end}
        flat={null}
        summary={null}
      />
    </div>
  );
}

function Chart({
  spec,
  points,
  end,
  flat,
  summary,
}: {
  spec: ChartSpec;
  points: TimelinePoint[];
  end: number;
  flat: { start: number; end: number } | null;
  summary: string | null;
}) {
  const x = (t: number) => (t / end) * W;
  const half = H / 2 - PAD_Y;
  const y = (v: number) =>
    H / 2 - (Math.max(-spec.limit, Math.min(spec.limit, v)) / spec.limit) * half;
  const bandY = y(spec.band);
  const range = spec.range !== undefined ? `range ${spec.range.toFixed(1)} ${spec.unit}` : null;
  const label = [spec.title, range, summary?.toLowerCase()].filter(Boolean).join(": ");
  const slot = W / Math.max(points.length, 1);

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold text-ink">{spec.title}</span>
        {range && <span className="text-muted tabular-nums">{range}</span>}
      </figcaption>
      <div className="grid grid-cols-[2rem_1fr] gap-2">
        <div aria-hidden className="flex flex-col justify-between py-0.5 text-[11px] text-muted">
          <span>High</span>
          <span>Low</span>
        </div>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-20 w-full overflow-visible rounded-xl bg-card-2"
        >
          <rect x={0} y={0} width={W} height={bandY} className="fill-lav/45" />
          <rect x={0} y={H - bandY} width={W} height={bandY} className="fill-lav/45" />
          {flat && (
            <rect
              data-flattest
              x={x(flat.start)}
              y={0}
              width={Math.max(2, x(flat.end) - x(flat.start))}
              height={H}
              className="fill-butter"
            />
          )}
          <polyline
            points={points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-brand"
          />
          {/* Hover targets wider than the line: one slot per word, with its value. */}
          {points.map((p, i) => (
            <rect key={i} x={x(p.t) - slot / 2} y={0} width={slot} height={H} fill="transparent">
              <title>{`${clock(p.t)} · ${levelText(p.v, spec.unit)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div aria-hidden className="ml-10 flex justify-between text-[11px] text-muted tabular-nums">
        <span>0:00</span>
        <span>{clock(end)}</span>
      </div>
    </figure>
  );
}

function levelText(v: number, unit: string): string {
  if (Math.abs(v) < 0.5) return "your usual level";
  return `${Math.abs(v).toFixed(1)} ${unit} ${v > 0 ? "above" : "below"} your usual`;
}
