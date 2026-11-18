"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useApi } from "@/lib/use-api";

/** Course → lessons on the dashboard. Locked lessons are shown (so users see what Pro adds) but not linked. */
export function CourseList() {
  const api = useApi();
  const courses = useQuery({ queryKey: ["courses"], queryFn: () => api.getCourses() });

  if (courses.isPending) return <p className="text-slate-500">Loading lessons…</p>;
  if (courses.isError) {
    return (
      <p role="alert" className="text-red-700">
        Couldn’t load lessons: {courses.error.message}
      </p>
    );
  }

  return (
    <>
      {courses.data.courses.map((course) => (
        <section key={course.slug} className="rounded-lg border border-slate-200 p-4">
          <h2 className="font-medium">{course.title}</h2>
          <p className="mb-4 text-sm text-slate-600">{course.summary}</p>
          <ol className="flex flex-col gap-2">
            {course.lessons.map((lesson) => (
              <li key={lesson.slug}>
                {lesson.locked ? (
                  <div
                    className="flex items-center justify-between rounded-md border border-dashed border-slate-300 px-3 py-2 text-slate-500"
                    aria-label={`${lesson.title} (locked, Pro only)`}
                  >
                    <span>
                      {lesson.order}. {lesson.title}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium">
                      <LockIcon /> Pro
                    </span>
                  </div>
                ) : (
                  <Link
                    href={`/app/lessons/${lesson.slug}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 hover:border-slate-400 hover:bg-slate-50"
                  >
                    <span>
                      {lesson.order}. {lesson.title}
                    </span>
                    {lesson.isFree && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">
                        Free
                      </span>
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
