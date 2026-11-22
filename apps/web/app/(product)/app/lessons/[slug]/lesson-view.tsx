"use client";

import { ErrorCode, type Exercise, type LessonResponse } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { Mascot } from "@/components/mascot";
import { track } from "@/funnel/analytics";
import { findLocalLesson } from "@/learn/catalog";
import { splitLessonBody } from "@/learn/lesson-steps";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { LocalLessonView } from "./local-lessons";
import { StoryWriter } from "./story-writer";

const backLink = (
  <Link href="/app" className="link w-fit text-sm font-bold">
    ← Back to Learn
  </Link>
);

export function LessonView({ slug, startStep = 0 }: { slug: string; startStep?: number }) {
  const local = findLocalLesson(slug);
  if (local) {
    return (
      <>
        {backLink}
        <LocalLessonView lesson={local} />
      </>
    );
  }
  return <RecordedLesson slug={slug} startStep={startStep} />;
}

function RecordedLesson({ slug, startStep }: { slug: string; startStep: number }) {
  const api = useApi();
  const lesson = useQuery({
    queryKey: ["lesson", slug],
    queryFn: () => api.getLesson(slug),
    // A 403/404 won't change by retrying — fail fast so the user sees the right screen.
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 1,
  });

  if (lesson.isPending) return <p className="text-muted">Loading lesson…</p>;

  if (lesson.isError) {
    const err = lesson.error;
    if (err instanceof ApiClientError && err.code === ErrorCode.LESSON_LOCKED) {
      return (
        <>
          {backLink}
          <LockedLesson />
        </>
      );
    }
    const notFound = err instanceof ApiClientError && err.status === 404;
    return (
      <>
        {backLink}
        <p role="alert" className="font-medium text-danger">
          {notFound ? "This lesson doesn’t exist." : `Couldn’t load the lesson: ${err.message}`}
        </p>
      </>
    );
  }

  return <LessonStepper lesson={lesson.data.lesson} startStep={startStep} />;
}

type Step =
  | { kind: "read"; title: string; body: string }
  | { kind: "write-story" }
  | { kind: "exercise"; exercise: Exercise; number: number; of: number }
  | { kind: "done" };

/** Lessons where the user writes something of their own (never the AI) before recording it. */
const WRITING_LESSONS = new Set(["your-story"]);

function buildSteps(lesson: LessonResponse["lesson"]): Step[] {
  const steps: Step[] = splitLessonBody(lesson.body).map((s) => ({ kind: "read", ...s }));
  if (WRITING_LESSONS.has(lesson.slug)) steps.push({ kind: "write-story" });
  lesson.exercises.forEach((exercise, i) =>
    steps.push({ kind: "exercise", exercise, number: i + 1, of: lesson.exercises.length }),
  );
  steps.push({ kind: "done" });
  return steps;
}

/**
 * One card at a time, like a learning app: why it matters → example → try this → each
 * exercise → done. A progress bar shows how far along the lesson the user is.
 */
function LessonStepper({
  lesson,
  startStep,
}: {
  lesson: LessonResponse["lesson"];
  startStep: number;
}) {
  const steps = buildSteps(lesson);
  const clamp = (i: number) => Math.min(Math.max(i, 0), steps.length - 1);
  const [index, setIndex] = useState(() => clamp(startStep));
  const step: Step = steps[index] ?? { kind: "done" };
  const next = () => setIndex((i) => clamp(i + 1));
  const back = () => setIndex((i) => clamp(i - 1));
  // After an exercise's results, "Continue lesson" comes back to the step after it.
  const afterExercise = `/app/lessons/${lesson.slug}?step=${index + 1}`;

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href={`/app/courses/${lesson.course.slug}`}
          aria-label="Close lesson"
          className="link flex size-10 items-center justify-center text-2xl leading-none font-bold"
        >
          ×
        </Link>
        <div
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          className="h-3 flex-1 overflow-hidden rounded-full bg-card-2"
        >
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-300"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <header className="flex flex-col gap-1">
        <p className="eyebrow">{lesson.course.title}</p>
        <h1 className="font-display text-[30px] leading-[1.05] font-semibold tracking-tight">
          {lesson.title}
        </h1>
      </header>

      {/* key: each step mounts fresh (resets the recorder, replays the entry animation). */}
      <div key={index} className="funnel-forward flex flex-col gap-4">
        {step.kind === "read" && (
          <ReadStep
            title={step.title}
            body={step.body}
            videoUrl={index === 0 ? lesson.videoUrl : null}
          />
        )}
        {step.kind === "write-story" && <StoryWriter />}
        {step.kind === "exercise" && (
          <ExerciseStep
            exercise={step.exercise}
            number={step.number}
            of={step.of}
            next={afterExercise}
          />
        )}
        {step.kind === "done" && (
          <DoneStep title={lesson.title} lessonSlug={lesson.slug} courseSlug={lesson.course.slug} />
        )}
      </div>

      {step.kind !== "done" && (
        <StepNav onBack={index > 0 ? back : undefined} onNext={next}>
          {step.kind === "exercise"
            ? step.number < step.of
              ? "Next exercise"
              : "Finish lesson"
            : "Continue"}
        </StepNav>
      )}
    </>
  );
}

function StepNav({
  onBack,
  onNext,
  children,
}: {
  onBack?: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      {onBack && (
        <button type="button" onClick={onBack} className="btn btn-secondary px-5" aria-label="Back">
          ←
        </button>
      )}
      <button type="button" onClick={onNext} className="btn btn-primary flex-1">
        {children}
      </button>
    </div>
  );
}

/** Each section gets its own surface, so "example" and "try this" are recognizable at a glance. */
const STEP_SURFACE: Record<string, string> = {
  Example: "surface rounded-[28px] p-5 shadow-soft",
  "Try this": "rounded-[28px] bg-lav p-5 text-on-pastel shadow-soft-sm",
};

function ReadStep({
  title,
  body,
  videoUrl,
}: {
  title: string;
  body: string;
  videoUrl: string | null;
}) {
  const pastel = title in STEP_SURFACE;
  return (
    <>
      {videoUrl && (
        // MVP: a plain video file URL. Later: CloudFront-hosted HLS (SPEC §5).
        <video
          src={videoUrl}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-3xl bg-black shadow-soft"
        />
      )}
      <section className={STEP_SURFACE[title] ?? "card"}>
        {title && (
          <p
            className={`mb-2 text-[11.5px] font-extrabold tracking-[0.12em] uppercase ${pastel ? "text-on-pastel-muted" : "text-muted"}`}
          >
            {title}
          </p>
        )}
        {/* react-markdown renders to React elements and ignores raw HTML by default (no XSS). */}
        <article className={pastel ? "lesson-body lesson-body-pastel" : "lesson-body"}>
          <Markdown>{body}</Markdown>
        </article>
      </section>
    </>
  );
}

function ExerciseStep({
  exercise,
  number,
  of,
  next,
}: {
  exercise: Exercise;
  number: number;
  of: number;
  next: string;
}) {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="pill bg-lav text-on-pastel uppercase">
          Exercise {number} of {of} · {exercise.type === "read_aloud" ? "Read aloud" : "Speak"}
        </span>
        <span className="text-xs font-semibold text-muted">up to {exercise.maxDurationSec}s</span>
      </div>
      <p className="font-display text-lg leading-snug font-semibold">{exercise.prompt}</p>
      {exercise.referenceText && (
        <blockquote className="rounded-3xl bg-card p-5 text-[17px] leading-relaxed font-medium text-ink shadow-soft-sm">
          {exercise.referenceText}
        </blockquote>
      )}
      <ExerciseRecorder exercise={exercise} next={next} />
    </div>
  );
}

function DoneStep({
  title,
  lessonSlug,
  courseSlug,
}: {
  title: string;
  lessonSlug: string;
  courseSlug: string;
}) {
  const courseHref = `/app/courses/${courseSlug}`;
  useEffect(
    () => track("lesson_completed", { lesson: lessonSlug, course: courseSlug }),
    [lessonSlug, courseSlug],
  );
  return (
    <div className="flex flex-col items-center gap-4 rounded-[28px] bg-sage p-8 text-center text-on-pastel shadow-soft">
      <Mascot mood="happy" size={110} label="The mascot celebrates" />
      <h2 className="font-display text-3xl font-semibold">Lesson complete!</h2>
      <p className="text-on-pastel-muted">{title}</p>
      <Link href={courseHref} className="btn w-full bg-on-pastel text-sage hover:opacity-90">
        Next lesson
      </Link>
    </div>
  );
}

function LockedLesson() {
  return (
    <div className="surface-glow flex flex-col items-start gap-3 rounded-[28px] p-6 shadow-soft">
      <Mascot mood="thinking" size={80} />
      <h1 className="font-display text-2xl leading-tight font-semibold">
        This lesson is part of SpeakUp Pro
      </h1>
      <p className="text-on-pastel-muted">
        Upgrade to unlock every lesson and up to 50 analyses a day.
      </p>
      <Link
        href="/pricing"
        className="btn btn-sm mt-1 bg-on-pastel px-5 text-butter hover:opacity-90"
      >
        See Pro plans
      </Link>
    </div>
  );
}
