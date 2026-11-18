import type { AttemptResult, Exercise, Metrics } from "@speakup/shared";
import type { ReactNode } from "react";
import { TranscriptView } from "./transcript-view";

const CATEGORY_LABEL: Record<string, string> = {
  pace: "Pace",
  pauses: "Pauses",
  fillers: "Filler words",
  clarity: "Clarity",
  accuracy: "Accuracy",
  structure: "Structure",
};

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-900",
  high: "bg-red-100 text-red-900",
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-700";
  if (score >= 55) return "text-amber-700";
  return "text-red-700";
}

/**
 * The analysis report (SPEC §11 /results): score, metric cards, AI feedback, transcript.
 * Presentational only (data in, markup out), so the funnel's results step can reuse it.
 */
export function ResultsReport({ exercise, result }: { exercise: Exercise; result: AttemptResult }) {
  const { metrics, feedback, transcript } = result;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start gap-5">
        <div className="flex flex-col items-center rounded-lg border border-slate-200 px-5 py-3">
          <span className={`text-4xl font-bold tabular-nums ${scoreColor(result.overallScore)}`}>
            {result.overallScore}
          </span>
          <span className="text-xs text-slate-500">out of 100</span>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-500">{exercise.prompt}</p>
          <p className="leading-relaxed text-slate-800">{feedback.summary}</p>
        </div>
      </header>

      <section aria-label="Metrics" className="grid gap-3 sm:grid-cols-2">
        <PaceCard metrics={metrics} />
        <Card title="Pauses">
          <Big>{metrics.pauses.count}</Big>
          <Small>
            {metrics.pauses.longCount} long (over 1.5 s)
            {metrics.pauses.count > 0 && ` · longest ${metrics.pauses.longestSec.toFixed(1)} s`}
          </Small>
        </Card>
        <Card title="Filler words">
          <Big>{metrics.fillers.count}</Big>
          <Small>{metrics.fillers.perMinute.toFixed(1)} per minute</Small>
        </Card>
        {metrics.readAloud ? (
          <Card title="Reading accuracy">
            <Big>{metrics.readAloud.accuracyPct.toFixed(0)}%</Big>
            <Small>
              {metrics.readAloud.missed.length} missed · {metrics.readAloud.substituted.length}{" "}
              changed · {metrics.readAloud.inserted.length} extra
            </Small>
          </Card>
        ) : (
          <Card title="Unclear words">
            <Big>{metrics.lowConfidenceWords.length}</Big>
            <Small>words the recognizer wasn’t sure about</Small>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Feedback</h2>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-slate-500">What went well</h3>
          <ul className="list-disc pl-5 text-slate-800">
            {feedback.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        {feedback.issues.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-slate-500">What to work on</h3>
            {feedback.issues.map((issue, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{CATEGORY_LABEL[issue.category]}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY_STYLE[issue.severity]}`}
                  >
                    {issue.severity}
                  </span>
                </div>
                <p className="text-sm text-slate-600 italic">{issue.evidence}</p>
                <p className="text-slate-800">
                  <span className="font-medium">Try this: </span>
                  {issue.tip}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-500">Next step</h3>
          <p className="text-slate-800">{feedback.nextStep}</p>
        </div>
      </section>

      {metrics.readAloud &&
        (metrics.readAloud.missed.length > 0 || metrics.readAloud.substituted.length > 0) && (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Reading details</h2>
            {metrics.readAloud.missed.length > 0 && (
              <p className="text-sm text-slate-700">
                <span className="font-medium">Skipped: </span>
                {metrics.readAloud.missed.join(", ")}
              </p>
            )}
            {metrics.readAloud.substituted.length > 0 && (
              <p className="text-sm text-slate-700">
                <span className="font-medium">Said differently: </span>
                {metrics.readAloud.substituted
                  .map((s) => `“${s.said}” instead of “${s.expected}”`)
                  .join(", ")}
              </p>
            )}
          </section>
        )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Transcript</h2>
        <TranscriptView words={transcript.words} metrics={metrics} />
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-medium text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <p className="text-2xl font-semibold tabular-nums">{children}</p>
);
const Small = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-slate-600">{children}</p>
);

/** WPM with a scale from 80 to 200 and the target band shaded. */
function PaceCard({ metrics }: { metrics: Metrics }) {
  const { wpm, wpmTarget } = metrics;
  const min = 80;
  const max = 200;
  const pct = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`;
  const verdict =
    wpm < wpmTarget.min ? "a bit slow" : wpm > wpmTarget.max ? "a bit fast" : "in the target range";
  return (
    <Card title="Pace">
      <Big>
        {wpm} <span className="text-base font-normal text-slate-500">words/min</span>
      </Big>
      <div className="relative mt-1 h-2 rounded bg-slate-100" aria-hidden>
        <div
          className="absolute h-full rounded bg-emerald-200"
          style={{
            left: pct(wpmTarget.min),
            width: `calc(${pct(wpmTarget.max)} - ${pct(wpmTarget.min)})`,
          }}
        />
        <div className="absolute -top-1 h-4 w-1 rounded bg-slate-900" style={{ left: pct(wpm) }} />
      </div>
      <Small>
        Target {wpmTarget.min}–{wpmTarget.max} · {verdict}
      </Small>
    </Card>
  );
}
