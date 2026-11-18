"use client";

import { ErrorCode, type Exercise } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Markdown from "react-markdown";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export function LessonView({ slug }: { slug: string }) {
  const api = useApi();
  const lesson = useQuery({
    queryKey: ["lesson", slug],
    queryFn: () => api.getLesson(slug),
    // A 403/404 won't change by retrying — fail fast so the user sees the right screen.
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 1,
  });

  const backLink = (
    <Link href="/app" className="text-sm text-slate-600 hover:underline">
      ← Back to dashboard
    </Link>
  );

  if (lesson.isPending) return <p className="text-slate-500">Loading lesson…</p>;

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
        <p role="alert" className="text-red-700">
          {notFound ? "This lesson doesn’t exist." : `Couldn’t load the lesson: ${err.message}`}
        </p>
      </>
    );
  }

  const { lesson: data } = lesson.data;
  return (
    <>
      {backLink}
      <header>
        <p className="text-sm text-slate-500">
          {data.course.title} · Lesson {data.order}
        </p>
        <h1 className="text-2xl font-semibold">{data.title}</h1>
      </header>

      {data.videoUrl ? (
        // MVP: a plain video file URL. Later: CloudFront-hosted HLS (SPEC §5).
        <video
          src={data.videoUrl}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-lg bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
          Video coming soon
        </div>
      )}

      {/* react-markdown renders to React elements and ignores raw HTML by default (no XSS). */}
      <article className="lesson-body">
        <Markdown>{data.body}</Markdown>
      </article>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Practice</h2>
        {data.exercises.map((exercise) => (
          <ExerciseCard key={exercise.id} exercise={exercise} />
        ))}
      </section>
    </>
  );
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          {exercise.type === "read_aloud" ? "Read aloud" : "Free speech"}
        </span>
        <span className="text-xs text-slate-500">up to {exercise.maxDurationSec}s</span>
      </div>
      <p className="font-medium">{exercise.prompt}</p>
      {exercise.referenceText && (
        <blockquote className="rounded-md bg-slate-50 p-3 leading-relaxed text-slate-800">
          {exercise.referenceText}
        </blockquote>
      )}
      <ExerciseRecorder exercise={exercise} />
    </div>
  );
}

function LockedLesson() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h1 className="text-xl font-semibold">This lesson is part of SpeakUp Pro</h1>
      <p className="text-slate-700">Upgrade to unlock every lesson and up to 50 analyses a day.</p>
      <Link
        href="/pricing"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
      >
        See Pro plans
      </Link>
    </div>
  );
}
