"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useApi } from "@/lib/use-api";

/** Course → lessons on the dashboard. Locked lessons are shown (so users see what Pro adds) but not linked. */
export function CourseList() {
  const api = useApi();
  const courses = useQuery({ queryKey: ["courses"], queryFn: () => api.getCourses() });

  if (courses.isPending) return <p className="text-muted">Loading lessons…</p>;
  if (courses.isError) {
    return (
      <p role="alert" className="font-medium text-danger">
        Couldn’t load lessons: {courses.error.message}
      </p>
    );
  }

  return (
    <>
      {courses.data.courses.map((course) => (
        <section key={course.slug} className="card">
          <h2 className="font-display text-xl font-semibold">{course.title}</h2>
          <p className="mt-1 mb-4 text-sm text-muted">{course.summary}</p>
          <ol className="flex flex-col gap-2">
            {course.lessons.map((lesson) => (
              <li key={lesson.slug}>
                {lesson.locked ? (
                  <div
                    className="flex min-h-13 items-center justify-between gap-3 rounded-[18px] border-[1.5px] border-dashed border-line-2 px-4 py-3 text-muted"
                    aria-label={`${lesson.title} (locked, Pro only)`}
                  >
                    <span>
                      {lesson.order}. {lesson.title}
                    </span>
                    <span className="pill shrink-0 bg-card-2 text-muted">
                      <LockIcon /> Pro
                    </span>
                  </div>
                ) : (
                  <Link
                    href={`/app/lessons/${lesson.slug}`}
                    className="flex min-h-13 items-center justify-between gap-3 rounded-[18px] border-[1.5px] border-line-2 bg-card-2 px-4 py-3 font-semibold transition-colors hover:border-peach"
                  >
                    <span>
                      {lesson.order}. {lesson.title}
                    </span>
                    {lesson.isFree && (
                      <span className="pill shrink-0 bg-sage text-on-pastel">Free</span>
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
    </svg>
  );
}
