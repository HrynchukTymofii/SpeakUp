"use client";

import { AnalysisErrorCode, type AnalysisStage } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Mascot } from "@/components/mascot";
import { ResultsReport } from "@/components/results-report";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

/** Poll every 1.5 s for up to ~60 s (SPEC §6.2). Later: push via SSE/WebSocket instead. */
const POLL_MS = 1_500;
const MAX_POLL_MS = 60_000;

const FAILURE_MESSAGE: Record<string, string> = {
  [AnalysisErrorCode.NO_SPEECH]:
    "We couldn’t hear enough speech in this recording. Check that the right microphone is selected, then record again a little closer to it.",
  [AnalysisErrorCode.STT_FAILED]:
    "We couldn’t process the audio of this recording. Please record it again.",
};
const GENERIC_FAILURE = "Something went wrong while analyzing this recording. Please try again.";

/** Progress steps shown while the worker runs. "queued" shows Transcribing as up next. */
function progressSteps(stage: AnalysisStage) {
  const order: AnalysisStage[] = ["awaiting_upload", "queued", "transcribing", "analyzing"];
  const at = order.indexOf(stage);
  return [
    { label: "Uploaded", done: at >= 1, active: at === 0 },
    { label: "Transcribing", done: at >= 3, active: at === 1 || at === 2 },
    { label: "Analyzing", done: false, active: at === 3 },
  ];
}

export function ResultsView({ attemptId }: { attemptId: string }) {
  const api = useApi();
  const [timedOut, setTimedOut] = useState(false);

  // Give up polling after a minute so a stuck job doesn't poll forever; "Check again" restarts it.
  useEffect(() => {
    if (timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), MAX_POLL_MS);
    return () => clearTimeout(timer);
  }, [timedOut]);

  const query = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => api.getAttempt(attemptId),
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 2,
    // Poll until the worker finishes; a finished attempt never changes, so stop then.
    refetchInterval: (q) => {
      const stage = q.state.data?.stage;
      return stage === "completed" || stage === "failed" || timedOut ? false : POLL_MS;
    },
  });

  const backLink = (
    <Link href="/app" className="link w-fit text-sm font-bold">
      ← Back to dashboard
    </Link>
  );

  if (query.isPending) return <p className="text-muted">Loading results…</p>;

  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <>
        {backLink}
        <p role="alert" className="font-medium text-danger">
          {notFound
            ? "This recording doesn’t exist."
            : `Couldn’t load results: ${query.error.message}`}
        </p>
      </>
    );
  }

  const { stage, attempt, exercise, result } = query.data;

  if (stage === "completed" && result) {
    return (
      <>
        {backLink}
        <ResultsReport exercise={exercise} result={result} />
      </>
    );
  }

  if (stage === "failed") {
    return (
      <>
        {backLink}
        <div role="alert" className="flex flex-col gap-3 rounded-[28px] bg-rose p-6 text-on-pastel">
          <Mascot mood="thinking" size={72} />
          <h1 className="font-display text-2xl font-semibold">
            We couldn’t analyze this recording
          </h1>
          <p className="text-on-pastel-muted">
            {FAILURE_MESSAGE[attempt.errorCode ?? ""] ?? GENERIC_FAILURE}
          </p>
        </div>
      </>
    );
  }

  // Still running: staged progress.
  return (
    <>
      {backLink}
      <div className="card flex flex-col gap-5 p-6">
        <Mascot mood="thinking" size={96} />
        <h1 className="font-display text-2xl font-semibold">Analyzing your recording…</h1>
        <ol className="flex flex-col gap-2" aria-live="polite">
          {progressSteps(stage).map(({ label, done, active }) => {
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
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
                <span className={active ? "font-bold text-ink" : "text-muted"}>{label}</span>
              </li>
            );
          })}
        </ol>
        {timedOut && (
          <div className="flex flex-col items-start gap-2 text-sm text-muted">
            <p>This is taking longer than usual.</p>
            <button
              type="button"
              onClick={() => {
                setTimedOut(false);
                void query.refetch();
              }}
              className="btn btn-secondary btn-sm"
            >
              Check again
            </button>
          </div>
        )}
      </div>
    </>
  );
}
