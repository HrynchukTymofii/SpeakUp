"use client";

import {
  AnalysisErrorCode,
  detectProblems,
  type AnalysisStage,
  type AttemptResult,
} from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { track } from "@/funnel/analytics";
import { ResultsReport } from "@/components/results-report";
import { COURSE_META, DEFAULT_META, PROBLEM_LABEL } from "@/learn/catalog";
import { lessonsFixing } from "@/learn/personalize";
import { TONE_SURFACE } from "@/learn/tone";
import { ApiClientError } from "@/lib/api";
import { MAX_POLL_MS, nextPollDelay, RESULT_WAIT_S } from "@/lib/poll";
import { useApi } from "@/lib/use-api";
import { Icon } from "@/components/icons";

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

/** "Continue" goes back into the flow the recording came from: the lesson, or the next topic. */
function continueLabel(next: string): string {
  if (next.startsWith("/app/practice/")) return "Next topic";
  if (next.startsWith("/app/lessons/")) return "Continue lesson";
  return "Continue";
}

export function ResultsView({ attemptId, next }: { attemptId: string; next?: string }) {
  const api = useApi();
  const [timedOut, setTimedOut] = useState(false);
  // When the current wait started: polling slows down as it grows (lib/poll.ts).
  const [waitStartedAt, setWaitStartedAt] = useState(() => Date.now());

  // Give up polling after a minute so a stuck job doesn't poll forever; "Check again" restarts it.
  useEffect(() => {
    if (timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), MAX_POLL_MS);
    return () => clearTimeout(timer);
  }, [timedOut]);

  // How long the last request took: a held one means the API is long-polling for us.
  const lastRequestMs = useRef(0);

  const query = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: async () => {
      const started = Date.now();
      // The first load answers at once (the page has something to show); after that the API
      // holds each request until the worker changes the attempt (lib/poll.ts).
      const wait = lastRequestMs.current === 0 ? 0 : RESULT_WAIT_S;
      const data = await api.getAttempt(attemptId, wait);
      lastRequestMs.current = Math.max(1, Date.now() - started);
      return data;
    },
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 2,
    // Keep asking until the worker finishes; a finished attempt never changes, so stop then.
    refetchInterval: (q) => {
      const stage = q.state.data?.stage;
      if (stage === "completed" || stage === "failed" || timedOut) return false;
      return nextPollDelay(Date.now() - waitStartedAt, lastRequestMs.current);
    },
  });

  // Once per attempt, when the analysis has an outcome (the page may have waited for it).
  const outcome = query.data?.stage === "completed" || query.data?.stage === "failed";
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    const data = query.data;
    if (!outcome || !data || tracked.current === attemptId) return;
    tracked.current = attemptId;
    track("results_viewed", {
      status: data.stage,
      exercise: data.exercise.slug,
      score: data.result?.overallScore,
    });
  }, [outcome, query.data, attemptId]);

  const backLink = (
    <Link href={next ?? "/app"} className="link w-fit text-sm font-bold">
      ← Back
    </Link>
  );
  const continueButton = next && (
    <Link href={next} className="btn btn-primary w-full">
      {continueLabel(next)}
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
        <ResultsReport exercise={exercise} result={result} topic={attempt.topic} />
        {continueButton}
        <FixWithLessons result={result} />
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
        {continueButton}
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
                setWaitStartedAt(Date.now());
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

/** Each problem found in this recording, linked to the lesson that fixes it. */
function FixWithLessons({ result }: { result: AttemptResult }) {
  const api = useApi();
  const courses = useQuery({ queryKey: ["courses"], queryFn: () => api.getCourses() });
  if (!courses.data) return null;

  const problems = detectProblems(result.metrics, result.feedback);
  const links = lessonsFixing(
    problems,
    courses.data.courses.map((c) => ({
      ...c,
      lessons: c.lessons.map((l) => ({ ...l, exerciseSlugs: l.exerciseSlugs ?? [] })),
    })),
  );
  if (links.length === 0) return null;

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="fix-heading">
      <h2 id="fix-heading" className="font-display text-xl font-semibold">
        Fix it with a lesson
      </h2>
      <ul className="flex flex-col gap-2">
        {links.map(({ problem, lesson, course }) => {
          const meta = COURSE_META[course.slug] ?? DEFAULT_META;
          return (
            <li key={lesson.slug}>
              <Link
                href={`/app/lessons/${lesson.slug}`}
                className="surface flex items-center gap-3 rounded-[20px] p-3 shadow-soft-sm transition-colors hover:bg-card-2"
              >
                <span
                  aria-hidden
                  className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-brand ${TONE_SURFACE[meta.tone]}`}
                >
                  <Icon name={meta.icon} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{lesson.title}</span>
                  <span className="text-xs font-semibold text-muted">
                    Fixes: {PROBLEM_LABEL[problem].toLowerCase()}
                  </span>
                </span>
                {lesson.locked && <span className="pill bg-card text-muted">Pro</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
