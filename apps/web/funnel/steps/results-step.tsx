"use client";

import { AnalysisErrorCode, type AttemptResult } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { SkillBars } from "@/components/skill-bars";
import { VoiceTimeline } from "@/components/voice-timeline";
import { CATEGORY_LABEL, hesitationSummary, voiceVerdict } from "@/lib/report";
import { useApi } from "@/lib/use-api";
import { track } from "../analytics";
import { useFunnelStore } from "../store";
import { Card, ContinueButton, StepHeading } from "../ui";
import type { StepProps } from "./props";

const STAGES = [
  "Transcribing",
  "Analyzing your voice and pauses",
  "Writing your feedback",
] as const;

/** Counts up from 0 to `to` with an ease-out, skipped for reduced motion. */
function useCountUp(to: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    // Reduced motion: jump straight to the final number (one frame, no animation).
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : durationMs;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, durationMs]);
  return value;
}

/**
 * Funnel results (SPEC §15.2 step 13): the claimed baseline, now read through the signed-in API.
 * While the worker is still running: a staged loader. Then the short "funnel variant" of the
 * report: animated score, skill bars, 3 metric cards, one strength, then EVERY issue the analysis
 * found (most important first) — the point of the check is to show what to work on.
 */
export function ResultsStep({ step, onNext }: StepProps<"results">) {
  const api = useApi();
  const { attemptId, markCompleted, setResultSummary } = useFunnelStore();
  const viewed = useRef(false);

  const query = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => api.getAttempt(attemptId ?? ""),
    enabled: attemptId !== null,
    refetchInterval: (q) => {
      const stage = q.state.data?.stage;
      return stage === "completed" || stage === "failed" ? false : 1_500;
    },
  });

  const data = query.data;
  const result = data?.stage === "completed" ? data.result : null;

  useEffect(() => {
    if (result && !viewed.current) {
      viewed.current = true;
      track("funnel_results_viewed", { score: result.overallScore });
    }
  }, [result]);

  const finish = () => {
    setResultSummary({
      topIssues: result?.feedback.issues.map((i) => i.category) ?? [],
      score: result?.overallScore ?? 0,
    });
    markCompleted(step.id);
    onNext();
  };

  if (data?.stage === "failed") {
    const noSpeech = data.attempt.errorCode === AnalysisErrorCode.NO_SPEECH;
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Mascot mood="thinking" size={104} className="-ml-2" />
        <StepHeading
          title="We couldn’t analyze your recording"
          subtitle={
            noSpeech
              ? "We didn’t hear enough speech. You can take the speaking check again from your dashboard."
              : "Something went wrong on our side. You can take the check again from your dashboard."
          }
        />
        <ContinueButton onClick={finish} />
      </div>
    );
  }

  if (!result) {
    // "analyzing" = transcript done; metrics are instant, so the LLM feedback is what remains.
    const stageIndex = data?.stage === "analyzing" ? 2 : 0;
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Mascot mood="thinking" size={112} className="-ml-2" />
        <StepHeading
          title="Analyzing your speaking…"
          subtitle="This usually takes a few seconds."
        />
        <ol className="card flex flex-col gap-3.5" aria-live="polite">
          {STAGES.map((label, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                    done
                      ? "bg-sage text-on-pastel"
                      : active
                        ? "animate-pulse bg-peach"
                        : "border-[1.5px] border-line-2"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span className={active ? "font-bold text-ink" : done ? "text-ink" : "text-muted"}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return <FunnelReport result={result} onContinue={finish} />;
}

function FunnelReport({ result, onContinue }: { result: AttemptResult; onContinue: () => void }) {
  const score = useCountUp(result.overallScore);
  const { metrics, feedback } = result;
  const strength = feedback.strengths[0];
  const { issues } = feedback;
  const hesitations = hesitationSummary(metrics);
  const voice = voiceVerdict(metrics);
  const paceVerdict =
    metrics.wpm < metrics.wpmTarget.min
      ? "a bit slow"
      : metrics.wpm > metrics.wpmTarget.max
        ? "a bit fast"
        : "on target";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col items-center gap-1 py-2">
        <Mascot mood="happy" size={96} />
        <p className="eyebrow mt-1">Your speaking score</p>
        <p
          className="font-display text-7xl leading-none font-semibold text-brand tabular-nums"
          aria-label={`${result.overallScore} out of 100`}
        >
          {score}
        </p>
        <p className="text-sm font-medium text-muted">out of 100</p>
      </div>

      <SkillBars feedback={feedback} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Pace" value={`${metrics.wpm}`} hint={`wpm · ${paceVerdict}`} />
        <Metric
          label="Filler words"
          value={`${metrics.fillers.count}`}
          hint={`${metrics.fillers.perMinute.toFixed(1)}/min`}
        />
        <Metric
          label="Hesitations"
          value={`${hesitations.count}`}
          hint={metrics.pauses.hesitationCount === undefined ? "over 1.5 s" : "mid-sentence"}
        />
      </div>

      {voice && metrics.voice?.timeline && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="eyebrow">Energy</p>
            <p className="font-display text-lg font-semibold">{voice.label}</p>
          </div>
          <VoiceTimeline metrics={metrics} />
        </Card>
      )}

      {strength && (
        <Card className="flex flex-col gap-1 border-0 bg-sage text-on-pastel">
          <p className="text-xs font-extrabold tracking-[0.12em] text-on-pastel-muted uppercase">
            What went well
          </p>
          <p className="font-medium">{strength}</p>
        </Card>
      )}

      {issues.length > 0 && (
        <h2 className="font-display text-xl font-semibold">
          {issues.length === 1 ? "1 thing to work on" : `${issues.length} things to work on`}
        </h2>
      )}
      {issues.map((issue, i) => (
        <Card key={i} className="flex flex-col gap-1">
          <p className="eyebrow">{CATEGORY_LABEL[issue.category] ?? issue.category}</p>
          <p className="text-muted italic">{issue.evidence}</p>
          <p>
            <span className="font-bold text-brand">Try this: </span>
            {issue.tip}
          </p>
        </Card>
      ))}

      <ContinueButton onClick={onContinue}>Build my plan</ContinueButton>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-card px-2 py-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] leading-tight text-muted">{hint}</p>
    </div>
  );
}
