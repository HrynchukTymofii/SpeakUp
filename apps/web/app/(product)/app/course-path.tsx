"use client";

import Link from "next/link";
import { COURSE_META, DEFAULT_META } from "@/learn/catalog";
import type { LearnCourse } from "@/learn/personalize";
import { lessonState, pathStates, type PathState } from "@/learn/progress";

/** Zig-zag offsets (px) for the path nodes, like a winding trail. */
const OFFSETS = [0, 44, 64, 44, 0, -44, -64, -44];

/** A course's page: a short header, then its lessons as a winding path. */
export function CoursePath({ course, completed }: { course: LearnCourse; completed: Set<string> }) {
  const meta = COURSE_META[course.slug] ?? DEFAULT_META;
  const lessonStates = course.lessons.map((l) => lessonState(l.exerciseSlugs, completed));
  const states = pathStates(
    course.lessons.map((l, i) => ({ state: lessonStates[i] ?? "new", locked: l.locked })),
  );
  const doneCount = states.filter((s) => s === "done").length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[30px] leading-[1.05] font-semibold tracking-tight">
          <span aria-hidden>{meta.icon} </span>
          {course.title}
        </h1>
        <p className="text-sm font-semibold text-muted tabular-nums">
          {doneCount}/{course.lessons.length} lessons
        </p>
      </header>

      <ol className="flex flex-col items-center gap-5" aria-label={`${course.title} lessons`}>
        {course.lessons.map((lesson, i) => (
          <li
            key={lesson.slug}
            className="flex flex-col items-center gap-1.5"
            style={{ transform: `translateX(${OFFSETS[i % OFFSETS.length] ?? 0}px)` }}
          >
            <PathNode
              href={`/app/lessons/${lesson.slug}`}
              state={states[i] ?? "open"}
              index={i + 1}
              title={lesson.title}
            />
            <span className="max-w-40 text-center text-sm leading-tight font-bold">
              {lesson.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const NODE_LABEL: Record<PathState, string> = {
  done: "done",
  current: "up next",
  open: "not started",
  locked: "locked, Pro",
};

function PathNode({
  href,
  state,
  index,
  title,
}: {
  href: string;
  state: PathState;
  index: number;
  title: string;
}) {
  const look: Record<PathState, string> = {
    done: "bg-sage text-on-pastel",
    current: "path-current bg-peach text-on-pastel shadow-peach",
    open: "border-[1.5px] border-line-2 bg-card-2 text-ink",
    locked: "border-[1.5px] border-dashed border-line-2 bg-card text-muted",
  };
  return (
    <Link
      href={href}
      aria-label={`${index}. ${title} (${NODE_LABEL[state]})`}
      className={`flex size-[72px] items-center justify-center rounded-full font-display text-2xl font-semibold transition-transform active:scale-95 ${look[state]}`}
    >
      {state === "done" ? (
        "✓"
      ) : state === "locked" ? (
        <LockIcon />
      ) : state === "current" ? (
        "★"
      ) : (
        index
      )}
    </Link>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-5 fill-current">
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
    </svg>
  );
}
