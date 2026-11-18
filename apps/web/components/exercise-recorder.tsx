"use client";

import { ErrorCode, type Attempt, type Exercise } from "@speakup/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError } from "@/lib/api";
import { uploadToS3 } from "@/lib/upload";
import { useApi } from "@/lib/use-api";
import { useRecorder, type Recording } from "@/lib/use-recorder";

type SubmitStep = "preparing" | "uploading" | "submitting";

const STEP_LABEL: Record<SubmitStep, string> = {
  preparing: "Preparing upload…",
  uploading: "Uploading your recording…",
  submitting: "Sending for analysis…",
};

function formatSeconds(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Turns any failure of the submit flow into a sentence a user can act on. */
function errorMessage(err: Error): string {
  if (err instanceof ApiClientError) {
    if (err.code === ErrorCode.PAYWALL) return "This exercise is part of SpeakUp Pro.";
    if (err.code === ErrorCode.QUOTA_EXCEEDED) return err.message;
    if (err.code === ErrorCode.UPLOAD_MISSING) return "The upload didn’t arrive. Please try again.";
    if (err.code === ErrorCode.RATE_LIMITED) return err.message;
    return `Something went wrong (${err.code}). Please try again.`;
  }
  return "Upload failed. Check your connection and try again.";
}

/** Plan limits (Pro exercise, daily quota) get a link to the upgrade options. */
const isPlanLimit = (err: Error) =>
  err instanceof ApiClientError &&
  (err.code === ErrorCode.PAYWALL || err.code === ErrorCode.QUOTA_EXCEEDED);

/**
 * Record → preview → submit for one exercise (SPEC §6.1–6.2).
 * Submit = 3 calls: create the attempt (API returns a pre-signed upload) → upload the audio
 * straight to S3 → confirm with the API, which verifies the file and queues the analysis.
 */
export function ExerciseRecorder({ exercise }: { exercise: Exercise }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const recorder = useRecorder(exercise.maxDurationSec);
  const [step, setStep] = useState<SubmitStep>("preparing");

  const submission = useMutation({
    mutationFn: async (recording: Recording): Promise<Attempt> => {
      setStep("preparing");
      const { attempt, upload } = await api.createAttempt({
        exerciseId: exercise.id,
        mimeType: recording.mimeType,
      });
      setStep("uploading");
      await uploadToS3(upload, recording.blob);
      setStep("submitting");
      const submitted = await api.submitAttempt(attempt.id, { durationMs: recording.durationMs });
      return submitted.attempt;
    },
    // The results page polls the attempt until the worker is done.
    onSuccess: (attempt) => router.push(`/results/${attempt.id}`),
    // Today's usage (shown on the dashboard) changed.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const recordAgain = () => {
    submission.reset();
    recorder.reset();
  };

  const { state } = recorder;
  const maxMs = exercise.maxDurationSec * 1000;

  if (submission.isSuccess) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-md bg-emerald-50 p-3">
        <p className="font-medium text-emerald-900">Recording submitted ✓</p>
        <p className="text-sm text-emerald-900">
          Opening your results…{" "}
          <Link href={`/results/${submission.data.id}`} className="underline">
            View results
          </Link>
        </p>
        <button type="button" onClick={recordAgain} className={secondaryButton}>
          Record another take
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Screen readers announce changes in this region (recording started, errors…). */}
      <div aria-live="polite" className="flex flex-col gap-2 text-sm">
        {state.kind === "idle" && (
          <p className="text-slate-600">
            We’ll ask for microphone access. Your recording is used only to analyze your speaking.
          </p>
        )}
        {state.kind === "requesting" && (
          <p className="text-slate-600">Waiting for microphone permission…</p>
        )}
        {state.kind === "recording" && (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 font-medium text-red-700">
              <span className="size-2 animate-pulse rounded-full bg-red-600" aria-hidden />
              Recording {formatSeconds(state.elapsedMs)} / {formatSeconds(maxMs)}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200" aria-hidden>
              <div
                className="h-full bg-red-600 transition-[width]"
                style={{ width: `${Math.min(100, (state.elapsedMs / maxMs) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {state.kind === "denied" && (
          <p role="alert" className="text-red-700">
            Microphone access is blocked. Allow it in your browser’s site settings (the icon next to
            the address bar), then try again.
          </p>
        )}
        {state.kind === "unsupported" && (
          <p role="alert" className="text-red-700">
            We couldn’t find a microphone, or this browser can’t record audio. Try a recent Chrome,
            Firefox, Edge or Safari.
          </p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="text-red-700">
            {state.message}
          </p>
        )}
        {submission.isPending && <p className="text-slate-600">{STEP_LABEL[step]}</p>}
        {submission.isError && (
          <p role="alert" className="text-red-700">
            {errorMessage(submission.error)}{" "}
            {isPlanLimit(submission.error) && (
              <Link href="/pricing" className="font-medium underline">
                See Pro
              </Link>
            )}
          </p>
        )}
      </div>

      {state.kind === "recorded" && (
        <audio controls src={state.recording.url} className="w-full">
          <track kind="captions" />
        </audio>
      )}

      <div className="flex flex-wrap gap-2">
        {(state.kind === "idle" ||
          state.kind === "denied" ||
          state.kind === "unsupported" ||
          state.kind === "error") && (
          <button type="button" onClick={() => void recorder.start()} className={primaryButton}>
            {state.kind === "idle" ? "Start recording" : "Try again"}
          </button>
        )}
        {state.kind === "recording" && (
          <button type="button" onClick={recorder.stop} className={primaryButton}>
            Stop
          </button>
        )}
        {state.kind === "recorded" && (
          <>
            <button
              type="button"
              onClick={() => submission.mutate(state.recording)}
              disabled={submission.isPending}
              className={primaryButton}
            >
              {submission.isError ? "Retry submit" : "Submit for analysis"}
            </button>
            <button
              type="button"
              onClick={recordAgain}
              disabled={submission.isPending}
              className={secondaryButton}
            >
              Record again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const primaryButton =
  "w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
