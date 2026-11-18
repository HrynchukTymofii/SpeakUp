"use client";

import { ErrorCode, type Exercise } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Markdown from "react-markdown";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { Mascot } from "@/components/mascot";
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
    <Link href="/app" className="link w-fit text-sm font-bold">
      ← Back to dashboard
    </Link>
  );

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

  const { lesson: data } = lesson.data;
  return (
    <>
      {backLink}
      <header className="flex flex-col gap-2">
        <p className="eyebrow">
          {data.course.title} · Lesson {data.order}
        </p>
        <h1 className="font-display text-[36px] leading-[1.05] font-semibold tracking-tight">
          {data.title}
        </h1>
      </header>

      {data.videoUrl ? (
        // MVP: a plain video file URL. Later: CloudFront-hosted HLS (SPEC §5).
        <video
          src={data.videoUrl}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-3xl bg-black shadow-soft"
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-card text-sm font-semibold text-muted">
          <Mascot mood="thinking" size={64} />
          Video coming soon
        </div>
      )}

      {/* react-markdown renders to React elements and ignores raw HTML by default (no XSS). */}
      <article className="lesson-body">
        <Markdown>{data.body}</Markdown>
      </article>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-semibold">Practice</h2>
        {data.exercises.map((exercise) => (
          <ExerciseCard key={exercise.id} exercise={exercise} />
        ))}
      </section>
    </>
  );
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="pill bg-lav text-on-pastel uppercase">
          {exercise.type === "read_aloud" ? "Read aloud" : "Free speech"}
        </span>
        <span className="text-xs font-semibold text-muted">up to {exercise.maxDurationSec}s</span>
      </div>
      <p className="font-display text-lg leading-snug font-semibold">{exercise.prompt}</p>
      {exercise.referenceText && (
        <blockquote className="rounded-3xl bg-butter p-5 text-[17px] leading-relaxed font-medium text-on-pastel">
          {exercise.referenceText}
        </blockquote>
      )}
      <ExerciseRecorder exercise={exercise} />
    </div>
  );
}

function LockedLesson() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[28px] bg-butter p-6 text-on-pastel shadow-soft">
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
