"use client";

import type { FunnelAnswers } from "@speakup/shared";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
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
    <div className="flex flex-1 flex-col items-center justify-center gap-7 py-8">
      <Mascot mood={pct >= 100 ? "happy" : "thinking"} size={120} />
      <h1 className="text-center font-display text-[28px] leading-tight font-semibold text-balance">
        {step.title}
      </h1>
      <div className="w-full">
        <p className="mb-3 text-center font-display text-5xl font-semibold text-peach tabular-nums">
          {Math.floor(pct)}%
        </p>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-card-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-peach to-butter"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ul className="card flex w-full flex-col gap-3.5">
        {step.checklist.map((item, i) => (
          <li key={item} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold transition-colors ${
                i < ticked ? "bg-sage text-on-pastel" : "border-[1.5px] border-line-2"
              }`}
            >
              {i < ticked ? "✓" : ""}
            </span>
            <span className={i < ticked ? "font-semibold text-ink" : "text-muted"}>{item}</span>
          </li>
        ))}
      </ul>

      {pending && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            className="funnel-sheet w-full max-w-md rounded-t-[32px] border-t border-line bg-card p-6 pb-8 shadow-soft"
          >
            <p className="mb-5 font-display text-xl leading-snug font-semibold">{pending.title}</p>
            <div className="grid grid-cols-2 gap-3">
              {(["yes", "no"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    track("funnel_answer", { step: `${step.id}:${pending.answerKey}`, value });
                    setAnswers((a) => ({ ...a, [pending.answerKey]: value }));
                  }}
                  className={value === "yes" ? "btn btn-primary" : "btn btn-secondary"}
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
