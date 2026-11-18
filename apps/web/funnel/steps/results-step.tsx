"use client";

import { AnalysisErrorCode, type AttemptResult } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/use-api";
import { track } from "../analytics";
import { useFunnelStore } from "../store";
import { Card, ContinueButton, StepHeading } from "../ui";
import type { StepProps } from "./props";

const STAGES = ["Transcribing", "Measuring pace", "Writing your feedback"] as const;

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
 * report: animated score, 3 metric cards, top 2 issues with tips, one strength.
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
        <StepHeading
          title="Analyzing your speaking…"
          subtitle="This usually takes a few seconds."
        />
        <ol className="flex flex-col gap-3" aria-live="polite">
          {STAGES.map((label, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`flex size-6 items-center justify-center rounded-full text-xs ${
                    done
                      ? "bg-emerald-600 text-white"
                      : active
                        ? "animate-pulse bg-slate-900 text-white"
                        : "bg-slate-200"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                <span className={active ? "font-medium" : "text-slate-500"}>{label}</span>
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
  const issues = feedback.issues.slice(0, 2);
  const paceVerdict =
    metrics.wpm < metrics.wpmTarget.min
      ? "a bit slow"
      : metrics.wpm > metrics.wpmTarget.max
        ? "a bit fast"
        : "on target";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col items-center gap-1 py-2">
        <p className="text-sm text-slate-500">Your speaking score</p>
        <p
          className="text-6xl font-bold tabular-nums"
          aria-label={`${result.overallScore} out of 100`}
        >
          {score}
        </p>
        <p className="text-sm text-slate-500">out of 100</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Pace" value={`${metrics.wpm}`} hint={`wpm · ${paceVerdict}`} />
        <Metric
          label="Filler words"
          value={`${metrics.fillers.count}`}
          hint={`${metrics.fillers.perMinute.toFixed(1)}/min`}
        />
        <Metric label="Long pauses" value={`${metrics.pauses.longCount}`} hint="over 1.5 s" />
      </div>

      {strength && (
        <Card className="bg-emerald-50">
          <p className="text-sm font-medium text-emerald-900">What went well</p>
          <p className="text-emerald-900">{strength}</p>
        </Card>
      )}

      {issues.map((issue, i) => (
        <Card key={i} className="flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-500">To work on</p>
          <p className="text-slate-600 italic">{issue.evidence}</p>
          <p>
            <span className="font-medium">Try this: </span>
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
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}
