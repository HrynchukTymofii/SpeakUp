"use client";

import { useQuery } from "@tanstack/react-query";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { useApi } from "@/lib/use-api";

/**
 * The baseline speaking check on the dashboard: a ~70-word read-aloud that measures where the
 * user starts. (M5.5 moves the first baseline into the funnel, before sign-up.)
 */
export function BaselineCard() {
  const api = useApi();
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
    <section className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold">Speaking check</h2>
        <p className="text-sm text-muted">{exercise.prompt}</p>
      </div>
      {exercise.referenceText && (
        <blockquote className="rounded-3xl bg-butter p-5 text-[17px] leading-relaxed font-medium text-on-pastel">
          {exercise.referenceText}
        </blockquote>
      )}
      <ExerciseRecorder exercise={exercise} />
    </section>
  );
}
