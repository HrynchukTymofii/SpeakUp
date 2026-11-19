"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { useApi } from "@/lib/use-api";
import { PlayCircle } from "@/components/icon-tile";

/**
 * Before the first analysis: the speaking check, as one "start here" card. The text and the
 * recorder open only when the user taps Start, so the Learn tab doesn't begin with a wall of text.
 */
export function BaselineCard() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const baseline = useQuery({
    queryKey: ["baseline"],
    queryFn: () => api.getBaselineExercise(),
  });

  if (baseline.isPending) return null;
  if (baseline.isError) {
    return (
      <p role="alert" className="font-medium text-danger">
        Couldn’t load the speaking check: {baseline.error.message}
      </p>
    );
  }

  const { exercise } = baseline.data;
  return (
    <section className="paper flex flex-col gap-4 rounded-[28px] bg-butter p-5 text-on-pastel shadow-soft">
      <p className="text-sm font-bold">Start here · {exercise.maxDurationSec} seconds</p>
      <h2 className="font-display text-[30px] leading-[1.05] font-semibold">
        Take the speaking check
      </h2>
      {open ? (
        <>
          {exercise.referenceText && (
            <blockquote className="rounded-3xl bg-card p-5 text-[17px] leading-relaxed font-medium text-ink">
              {exercise.referenceText}
            </blockquote>
          )}
          <div className="rounded-3xl bg-card p-4 text-ink">
            <ExerciseRecorder exercise={exercise} next="/app" />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-between rounded-full bg-white py-2 pr-2 pl-5 font-bold shadow-soft-sm"
        >
          Start
          <PlayCircle />
        </button>
      )}
    </section>
  );
}
