"use client";

import { ErrorCode, type Attempt, type Exercise } from "@speakup/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mascot, type MascotMood } from "@/components/mascot";
import { track } from "@/funnel/analytics";
import { resultsHref } from "@/learn/practice";
import { ApiClientError } from "@/lib/api";
import { uploadToS3 } from "@/lib/upload";
import { useApi } from "@/lib/use-api";
import { useRecorder, type Recording } from "@/lib/use-recorder";

type SubmitStep = "preparing" | "uploading" | "submitting";

const STEP_LABEL: Record<SubmitStep, string> = {
  preparing: "Preparing upload…",
  uploading: "Uploading…",
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
 *
 * After a submit the user always lands on the results page, which shows the analysis progress
 * and then the report. `next` = where its "Continue" button goes (the next lesson step, another
 * topic…), so a lesson or practice session carries on from there.
 * Submit = 3 calls: create the attempt (API returns a pre-signed upload) → upload the audio
 * straight to S3 → confirm with the API, which verifies the file and queues the analysis.
 */
export function ExerciseRecorder({
  exercise,
  topic,
  next,
}: {
  exercise: Exercise;
  /** Practice modes: the topic the user is speaking about (stored on the attempt). */
  topic?: string;
  /** In-app path for the results page's "Continue" button. */
  next?: string;
}) {
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
        ...(topic ? { topic } : {}),
      });
      setStep("uploading");
      await uploadToS3(upload, recording.blob);
      setStep("submitting");
      const submitted = await api.submitAttempt(attempt.id, { durationMs: recording.durationMs });
      return submitted.attempt;
    },
    // The results page polls the attempt until the worker is done.
    onSuccess: (attempt, recording) => {
      track("recording_submitted", {
        exercise: exercise.slug,
        exerciseType: exercise.type,
        durationSec: Math.round(recording.durationMs / 1000),
      });
      router.push(resultsHref(attempt.id, next));
    },
    // Today's usage and the practice history (progress, streak, used topics) changed.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["attempts"] });
    },
  });

  const recordAgain = () => {
    submission.reset();
    recorder.reset();
  };

  const { state } = recorder;
  const maxMs = exercise.maxDurationSec * 1000;
  const busy = submission.isPending || submission.isSuccess;
  const mood: MascotMood = busy
    ? "thinking"
    : state.kind === "recording" || state.kind === "requesting"
      ? "listening"
      : state.kind === "recorded"
        ? "happy"
        : "idle";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Mascot mood={mood} size={56} />
        {/* Screen readers announce changes in this region (recording started, errors…). */}
        <div aria-live="polite" className="flex flex-1 flex-col gap-2 text-sm">
          {state.kind === "idle" && <p className="text-muted">Tap record when you’re ready.</p>}
          {state.kind === "requesting" && (
            <p className="text-muted">Waiting for microphone permission…</p>
          )}
          {state.kind === "recording" && (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 font-bold text-ink tabular-nums">
                <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />
                {formatSeconds(state.elapsedMs)} / {formatSeconds(maxMs)}
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-card-2" aria-hidden>
                <div
                  className="h-full rounded-full bg-peach transition-[width]"
                  style={{ width: `${Math.min(100, (state.elapsedMs / maxMs) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {state.kind === "recorded" && !busy && !submission.isError && (
            <p className="text-muted">Listen back, or send it for feedback.</p>
          )}
          {state.kind === "denied" && (
            <p role="alert" className="font-medium text-danger">
              Microphone access is blocked. Allow it in your browser’s site settings (the icon next
              to the address bar), then try again.
            </p>
          )}
          {state.kind === "unsupported" && (
            <p role="alert" className="font-medium text-danger">
              We couldn’t find a microphone, or this browser can’t record audio. Try a recent
              Chrome, Firefox, Edge or Safari.
            </p>
          )}
          {state.kind === "error" && (
            <p role="alert" className="font-medium text-danger">
              {state.message}
            </p>
          )}
          {submission.isPending && <p className="text-muted">{STEP_LABEL[step]}</p>}
          {submission.isSuccess && <p className="text-muted">Opening your feedback…</p>}
          {submission.isError && (
            <p role="alert" className="font-medium text-danger">
              {errorMessage(submission.error)}{" "}
              {isPlanLimit(submission.error) && (
                <Link href="/pricing" className="font-bold text-brand underline">
                  See Pro
                </Link>
              )}
            </p>
          )}
        </div>
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
              disabled={busy}
              className={primaryButton}
            >
              {submission.isError ? "Retry" : "Get feedback"}
            </button>
            <button type="button" onClick={recordAgain} disabled={busy} className={secondaryButton}>
              Record again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const primaryButton = "btn btn-primary min-h-12 flex-1 px-5";
const secondaryButton = "btn btn-secondary min-h-12 px-5";
