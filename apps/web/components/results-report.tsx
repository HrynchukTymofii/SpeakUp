import type { AttemptResult, Exercise, Metrics } from "@speakup/shared";
import type { ReactNode } from "react";
import {
  CATEGORY_LABEL,
  hesitationSummary,
  punctuationSummary,
  scoreSurface,
  voiceVerdict,
} from "@/lib/report";
import { Mascot } from "./mascot";
import { SkillBars } from "./skill-bars";
import { TranscriptView } from "./transcript-view";

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-sky text-on-pastel",
  medium: "bg-butter text-on-pastel",
  high: "bg-rose text-on-pastel",
};

/**
 * The analysis report (SPEC §11 /results): score, metric cards, AI feedback, transcript.
 * Presentational only (data in, markup out), so the funnel's results step can reuse it.
 */
export function ResultsReport({
  exercise,
  result,
  topic,
}: {
  exercise: Exercise;
  result: AttemptResult;
  /** Practice modes: the topic is what the user spoke about; the mode's prompt is generic. */
  topic?: string | null;
}) {
  const { metrics, feedback, transcript } = result;
  const voice = voiceVerdict(metrics);
  const punctuation = punctuationSummary(metrics);
  const hesitations = hesitationSummary(metrics);
  const language = metrics.language;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 rounded-[28px] border border-line bg-card p-5 shadow-soft">
        <div className="flex items-center gap-4">
          <div
            className={`flex shrink-0 flex-col items-center rounded-3xl px-5 py-3 text-on-pastel ${scoreSurface(result.overallScore)}`}
          >
            <span className="font-display text-5xl leading-none font-semibold tabular-nums">
              {result.overallScore}
            </span>
            <span className="mt-1 text-xs font-bold text-on-pastel-muted">out of 100</span>
          </div>
          <Mascot
            mood={result.overallScore >= 55 ? "happy" : "thinking"}
            size={84}
            className="ml-auto"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-muted">{topic ?? exercise.prompt}</p>
          <p className="text-[17px] leading-relaxed text-ink">{feedback.summary}</p>
        </div>
        {feedback.subscores && feedback.subscores.length > 0 && (
          <div className="border-t border-line pt-4">
            <SkillBars feedback={feedback} />
          </div>
        )}
      </header>

      <section aria-label="Metrics" className="grid gap-3 sm:grid-cols-2">
        <PaceCard metrics={metrics} />
        {punctuation ? (
          <Card title="Pauses at punctuation">
            <Big>{punctuation.honoredPct}%</Big>
            <Small>{punctuation.detail}</Small>
          </Card>
        ) : (
          <Card title="Hesitations">
            <Big>{hesitations.count}</Big>
            <Small>{hesitations.detail}</Small>
          </Card>
        )}
        {voice && (
          <Card title="Voice">
            <Big>{voice.label}</Big>
            <Small>{voice.detail}</Small>
          </Card>
        )}
        {language && (
          <Card title="Wording">
            <Big>{language.hedges.count}</Big>
            <Small>
              hedges like “I think”, “kind of”
              {language.repeatedPhrases.length > 0 &&
                ` · ${language.repeatedPhrases.length} repeated phrases`}
            </Small>
          </Card>
        )}
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
        <h2 className="font-display text-2xl font-semibold">Feedback</h2>
        <div className="flex flex-col gap-2 rounded-3xl bg-sage p-5 text-on-pastel">
          <h3 className="text-xs font-extrabold tracking-[0.12em] text-on-pastel-muted uppercase">
            What went well
          </h3>
          <ul className="flex flex-col gap-1.5 font-medium">
            {feedback.strengths.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden>✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        {feedback.issues.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="eyebrow">What to work on</h3>
            {feedback.issues.map((issue, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-5 shadow-soft-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-semibold">
                    {CATEGORY_LABEL[issue.category] ?? issue.category}
                  </span>
                  <span className={`pill ${SEVERITY_STYLE[issue.severity]}`}>{issue.severity}</span>
                </div>
                <p className="text-sm text-muted italic">{issue.evidence}</p>
                <p className="text-ink">
                  <span className="font-bold text-peach">Try this: </span>
                  {issue.tip}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1 rounded-3xl bg-lav p-5 text-on-pastel">
          <h3 className="text-xs font-extrabold tracking-[0.12em] text-on-pastel-muted uppercase">
            Next step
          </h3>
          <p className="font-medium">{feedback.nextStep}</p>
        </div>
      </section>

      {metrics.readAloud &&
        (metrics.readAloud.missed.length > 0 || metrics.readAloud.substituted.length > 0) && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-2xl font-semibold">Reading details</h2>
            {metrics.readAloud.missed.length > 0 && (
              <p className="text-sm text-ink/85">
                <span className="font-bold text-ink">Skipped: </span>
                {metrics.readAloud.missed.join(", ")}
              </p>
            )}
            {metrics.readAloud.substituted.length > 0 && (
              <p className="text-sm text-ink/85">
                <span className="font-bold text-ink">Said differently: </span>
                {metrics.readAloud.substituted
                  .map((s) => `“${s.said}” instead of “${s.expected}”`)
                  .join(", ")}
              </p>
            )}
          </section>
        )}

      {language && (language.repeatedPhrases.length > 0 || language.restarts.length > 0) && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold">Wording details</h2>
          {language.repeatedPhrases.length > 0 && (
            <p className="text-sm text-ink/85">
              <span className="font-bold text-ink">Said more than once: </span>
              {language.repeatedPhrases.map((r) => `“${r.phrase}” ×${r.count}`).join(", ")}
            </p>
          )}
          {language.restarts.length > 0 && (
            <p className="text-sm text-ink/85">
              <span className="font-bold text-ink">Restarts: </span>
              {language.restarts.map((r) => `“${r.phrase}”`).join(", ")}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold">Transcript</h2>
        <TranscriptView words={transcript.words} metrics={metrics} />
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-3xl border border-line bg-card p-5 shadow-soft-sm">
      <h3 className="font-sans text-sm font-bold text-muted">{title}</h3>
      {children}
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <p className="font-display text-3xl font-semibold tabular-nums">{children}</p>
);
const Small = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted">{children}</p>
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
        {wpm} <span className="font-sans text-base font-medium text-muted">words/min</span>
      </Big>
      <div className="relative my-1.5 h-2 rounded-full bg-card-2" aria-hidden>
        <div
          className="absolute h-full rounded-full bg-sage/70"
          style={{
            left: pct(wpmTarget.min),
            width: `calc(${pct(wpmTarget.max)} - ${pct(wpmTarget.min)})`,
          }}
        />
        <div
          className="absolute -top-1 h-4 w-1.5 -translate-x-1/2 rounded-full bg-peach shadow-peach"
          style={{ left: pct(wpm) }}
        />
      </div>
      <Small>
        Target {wpmTarget.min}–{wpmTarget.max} · {verdict}
      </Small>
    </Card>
  );
}
