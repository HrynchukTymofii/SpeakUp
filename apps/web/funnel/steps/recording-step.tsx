"use client";

import { ErrorCode, FUNNEL_MAX_RECORDING_SEC } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Mascot, type MascotMood } from "@/components/mascot";
import { ApiClientError } from "@/lib/api";
import { uploadToS3 } from "@/lib/upload";
import { useRecorder, type Recording } from "@/lib/use-recorder";
import { track } from "../analytics";
import { funnelApi } from "../api";
import { useFunnelStore } from "../store";
import { Turnstile } from "../turnstile";
import { Card, ContinueButton, StepHeading } from "../ui";
import type { StepProps } from "./props";

const formatSeconds = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function submitError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === ErrorCode.RATE_LIMITED) return err.message;
    if (err.code === ErrorCode.BOT_CHECK_FAILED)
      return "Our bot check didn’t go through. Please try again.";
    if (err.code === ErrorCode.UPLOAD_MISSING) return "The upload didn’t arrive. Please try again.";
  }
  return "Something went wrong while sending your recording. Please try again.";
}

/**
 * The anonymous baseline (SPEC §15.2 step 11): ready → 3-2-1 → recording (timer, live level,
 * max 45 s) → review (play back / re-record / submit). Submit = Turnstile token → create the
 * attempt → upload straight to S3 → submit. The analysis starts now, while they sign up.
 */
export function RecordingStep({ step, onNext }: StepProps<"recording">) {
  const { guestToken, attemptId, completed, setAttemptId, markCompleted } = useFunnelStore();
  const alreadyDone = attemptId !== null && completed.includes(step.id);

  const exercise = useQuery({
    queryKey: ["funnel-exercise"],
    queryFn: () => funnelApi.getExercise(guestToken ?? ""),
    enabled: guestToken !== null && !alreadyDone,
    staleTime: Infinity,
  });
  const maxSec = Math.min(
    exercise.data?.exercise.maxDurationSec ?? FUNNEL_MAX_RECORDING_SEC,
    FUNNEL_MAX_RECORDING_SEC,
  );
  const recorder = useRecorder(maxSec);
  const startRecording = recorder.start; // stable callback (useCallback in the hook)

  const [countdown, setCountdown] = useState<number | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // 3-2-1, then start recording (state changes happen in the timer callback, not the effect body).
  useEffect(() => {
    if (countdown === null) return;
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void startRecording();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, startRecording]);

  if (alreadyDone) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Mascot mood="happy" size={104} className="-ml-2" />
        <StepHeading title="Your recording is in ✓" subtitle="We’re analyzing it now." />
        <ContinueButton onClick={() => onNext()} />
      </div>
    );
  }

  const submit = async (recording: Recording) => {
    if (!guestToken || !turnstileToken) return;
    setPhase("uploading");
    setError(null);
    try {
      const { attempt, upload } = await funnelApi.createAttempt(guestToken, {
        mimeType: recording.mimeType,
        turnstileToken,
      });
      await uploadToS3(upload, recording.blob);
      await funnelApi.submitAttempt(guestToken, attempt.id, recording.durationMs);
      setAttemptId(attempt.id);
      markCompleted(step.id);
      track("funnel_recording_submitted", { durationMs: recording.durationMs });
      onNext();
    } catch (err) {
      setPhase("error");
      setError(submitError(err));
      // Turnstile tokens are single-use: get a fresh one for the retry.
      setTurnstileToken(null);
      setTurnstileKey((k) => k + 1);
    }
  };

  const { state } = recorder;
  const text = exercise.data?.exercise.referenceText;
  const mood: MascotMood =
    state.kind === "recording" || countdown !== null
      ? "listening"
      : state.kind === "recorded"
        ? "happy"
        : "idle";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center gap-3">
        <Mascot mood={mood} size={72} className="-ml-1" />
        <StepHeading
          title="Read this out loud"
          subtitle={`At your normal pace. Up to ${maxSec} seconds.`}
        />
      </div>

      <Card className="border-0 bg-butter text-lg leading-relaxed font-medium text-on-pastel">
        {exercise.isPending
          ? "Loading…"
          : (text ?? "Couldn’t load the text. Please reload the page.")}
      </Card>

      <div aria-live="polite" className="flex min-h-16 flex-col items-center justify-center gap-2">
        {countdown !== null && (
          <p className="font-display text-7xl font-semibold text-peach tabular-nums">{countdown}</p>
        )}
        {state.kind === "requesting" && <p className="text-muted">Starting microphone…</p>}
        {state.kind === "recording" && (
          <>
            <p className="flex items-center gap-2 font-bold text-ink tabular-nums">
              <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
              {formatSeconds(state.elapsedMs)} / {formatSeconds(maxSec * 1000)}
            </p>
            <LevelMeter getLevel={recorder.getLevel} />
          </>
        )}
        {state.kind === "recorded" && (
          <audio controls src={state.recording.url} className="w-full rounded-full">
            <track kind="captions" />
          </audio>
        )}
        {(state.kind === "denied" || state.kind === "unsupported" || state.kind === "error") && (
          <p role="alert" className="text-center font-medium text-danger">
            {state.kind === "denied"
              ? "Microphone access is blocked. Allow it in your browser settings, then try again."
              : state.kind === "unsupported"
                ? "This browser can’t record audio. Try a recent Chrome, Safari, Firefox or Edge."
                : state.message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-center font-medium text-danger">
            {error}
          </p>
        )}
      </div>

      {state.kind === "recorded" && <Turnstile key={turnstileKey} onToken={setTurnstileToken} />}

      <div className="mt-auto flex flex-col gap-2">
        {state.kind === "recording" ? (
          <ContinueButton onClick={recorder.stop}>Stop</ContinueButton>
        ) : state.kind === "recorded" ? (
          <>
            <ContinueButton
              disabled={phase === "uploading" || !turnstileToken}
              onClick={() => void submit(state.recording)}
            >
              {phase === "uploading"
                ? "Sending…"
                : turnstileToken
                  ? "Submit my recording"
                  : "Checking you’re human…"}
            </ContinueButton>
            <button
              type="button"
              disabled={phase === "uploading"}
              onClick={() => {
                recorder.reset();
                setError(null);
              }}
              className="py-2 text-sm font-bold text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
            >
              Record again
            </button>
          </>
        ) : (
          <ContinueButton
            disabled={!text || countdown !== null || state.kind === "requesting"}
            onClick={() => setCountdown(3)}
          >
            {state.kind === "idle" ? "Start recording" : "Try again"}
          </ContinueButton>
        )}
      </div>
    </div>
  );
}

/** Bars that follow the mic level. Updated via requestAnimationFrame → no React re-renders. */
function LevelMeter({ getLevel }: { getLevel: () => number }) {
  const barsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const level = getLevel();
      const bars = barsRef.current?.children;
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          const bar = bars[i] as HTMLElement;
          bar.style.opacity = level * bars.length > i ? "1" : "0.2";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return (
    <div ref={barsRef} className="flex h-8 items-end gap-1" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-peach transition-opacity"
          style={{ height: `${30 + i * 6}%`, opacity: 0.2 }}
        />
      ))}
    </div>
  );
}
