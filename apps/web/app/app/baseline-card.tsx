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
      <p role="alert" className="text-red-700">
        Couldn’t load the speaking check: {baseline.error.message}
      </p>
    );
  }

  const { exercise } = baseline.data;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div>
        <h2 className="font-medium">Speaking check</h2>
        <p className="text-sm text-slate-600">{exercise.prompt}</p>
      </div>
      {exercise.referenceText && (
        <blockquote className="rounded-md bg-slate-50 p-3 leading-relaxed text-slate-800">
          {exercise.referenceText}
        </blockquote>
      )}
      <ExerciseRecorder exercise={exercise} />
    </section>
  );
}
