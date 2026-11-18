"use client";

import type { FunnelAnswers } from "@speakup/shared";
import { useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import { useFunnelStore } from "../store";
import type { StepProps } from "./props";

/**
 * Monotone 0→1 curve that "breathes": slow start, a surge, slow finish (same idea as the
 * reference funnel's loader). The wave term's slope is 0.55·cos(5πt) < 1, so it never goes back.
 */
const curve = (t: number) => {
  const wave = t + (0.55 * Math.sin(5 * Math.PI * t)) / (5 * Math.PI);
  return wave < 0.5 ? 4 * wave ** 3 : 1 - (-2 * wave + 2) ** 3 / 2;
};

/**
 * "Building your personal plan" (SPEC §15.2 step 16): progress 0→100 % over ~12 s with a checklist
 * that ticks off, pausing at set points for a yes/no question in a bottom sheet. The answers are
 * real (saved to the profile) — the loader itself is pacing, not a computation.
 */
export function LoaderStep({ step, ctx, onNext }: StepProps<"loader_with_questions">) {
  const markCompleted = useFunnelStore((s) => s.markCompleted);
  const [pct, setPct] = useState(0);
  const [answers, setAnswers] = useState<FunnelAnswers>(() => {
    // Questions answered on an earlier visit aren't asked again.
    const known: FunnelAnswers = {};
    for (const q of step.questions) {
      const value = ctx.answers[q.answerKey];
      if (value) known[q.answerKey] = value;
    }
    return known;
  });
  const elapsed = useRef(0); // animation time so far, kept across question pauses
  const finished = useRef(false);

  const pending = step.questions.find((q) => pct >= q.atPct && answers[q.answerKey] === undefined);

  useEffect(() => {
    if (pending || finished.current) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current = Math.min(step.durationMs, elapsed.current + (now - last));
      last = now;
      const p = curve(elapsed.current / step.durationMs) * 100;
      setPct(p);
      const waiting = step.questions.some(
        (q) => p >= q.atPct && answers[q.answerKey] === undefined,
      );
      if (waiting) return; // stop here; the question sheet opens
      if (elapsed.current < step.durationMs) {
        raf = requestAnimationFrame(tick);
      } else if (!finished.current) {
        finished.current = true;
        markCompleted(step.id);
        setTimeout(() => onNext(answers), 400);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pending, answers, step, markCompleted, onNext]);

  const ticked = Math.floor((pct / 100) * step.checklist.length);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
      <h1 className="text-center text-2xl font-semibold">{step.title}</h1>
      <div className="w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-center text-sm text-slate-500 tabular-nums">{Math.floor(pct)}%</p>
      </div>
      <ul className="flex w-full flex-col gap-3">
        {step.checklist.map((item, i) => (
          <li key={item} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`flex size-6 items-center justify-center rounded-full text-xs transition-colors ${
                i < ticked ? "bg-emerald-600 text-white" : "bg-slate-200"
              }`}
            >
              {i < ticked ? "✓" : ""}
            </span>
            <span className={i < ticked ? "text-slate-900" : "text-slate-500"}>{item}</span>
          </li>
        ))}
      </ul>

      {pending && (
        <div className="fixed inset-0 z-10 flex items-end justify-center bg-slate-900/30">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            className="funnel-sheet w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-xl"
          >
            <p className="mb-5 text-lg font-semibold">{pending.title}</p>
            <div className="grid grid-cols-2 gap-3">
              {(["yes", "no"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    track("funnel_answer", { step: `${step.id}:${pending.answerKey}`, value });
                    setAnswers((a) => ({ ...a, [pending.answerKey]: value }));
                  }}
                  className="rounded-xl border border-slate-300 py-3 font-semibold hover:bg-slate-50"
                >
                  {value === "yes" ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
