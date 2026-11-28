"use client";

import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { COURSE_META, DEFAULT_META } from "@/learn/catalog";
import type { LearnCourse } from "@/learn/personalize";
import { lessonState, pathStates, type PathState } from "@/learn/progress";
import { Icon } from "@/components/icons";

/** Zig-zag offsets (px) for the path nodes, like a winding trail. */
const OFFSETS = [0, 56, 80, 56, 0, -56, -80, -56];

/**
 * A course's page: a short header, then its lessons as a winding path of raised buttons on a
 * dotted canvas. The lesson to do next carries a bubble with its title and START; the mascot
 * sits beside it.
 */
export function CoursePath({ course, completed }: { course: LearnCourse; completed: Set<string> }) {
  const meta = COURSE_META[course.slug] ?? DEFAULT_META;
  const states = pathStates(
    course.lessons.map((l) => ({
      state: lessonState(l.exerciseSlugs, completed),
      locked: l.locked,
    })),
  );
  const doneCount = states.filter((s) => s === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-3 font-display text-[30px] leading-[1.05] font-bold tracking-tight">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lav text-brand">
            <Icon name={meta.icon} />
          </span>
          {course.title}
        </h1>
        <p className="text-sm font-semibold text-muted tabular-nums">
          {doneCount}/{course.lessons.length} lessons
        </p>
      </header>

      <ol
        className="dots -mx-4 flex flex-col items-center gap-9 px-4 py-10"
        aria-label={`${course.title} lessons`}
      >
        {course.lessons.map((lesson, i) => {
          const state = states[i] ?? "open";
          const offset = OFFSETS[i % OFFSETS.length] ?? 0;
          return (
            <li
              key={lesson.slug}
              className="relative flex flex-col items-center"
              style={{ transform: `translateX(${offset}px)` }}
            >
              {state === "current" && (
                <StartBubble
                  href={`/app/lessons/${lesson.slug}`}
                  title={lesson.title}
                  offset={offset}
                />
              )}
              {/* The node and (next to the lesson to do) the mascot, placed against the node. */}
              <span className="relative flex">
                <PathNode
                  href={`/app/lessons/${lesson.slug}`}
                  state={state}
                  index={i + 1}
                  title={lesson.title}
                />
                {state === "current" && (
                  <Mascot
                    mood="happy"
                    size={56}
                    className={`absolute top-1 ${offset > 0 ? "right-full mr-3" : "left-full ml-3"}`}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The speech bubble over the next lesson: its title and a big START. It stays centered on the
 * page (undoing the node's zig-zag offset, so it never overflows a phone screen); the arrow
 * points at the node.
 */
function StartBubble({ href, title, offset }: { href: string; title: string; offset: number }) {
  return (
    <div
      className="relative mb-4 flex w-60 flex-col gap-3 rounded-[22px] bg-ink p-4 text-page shadow-soft"
      style={{ transform: `translateX(${-offset}px)` }}
    >
      <p className="font-display text-lg leading-tight font-semibold">{title}</p>
      <Link
        href={href}
        className="flex min-h-11 items-center justify-center rounded-2xl bg-page font-extrabold tracking-wide text-ink uppercase"
      >
        Start
      </Link>
      <span
        aria-hidden
        className="absolute -bottom-2 size-4 -translate-x-1/2 rotate-45 bg-ink"
        style={{ left: `calc(50% + ${offset}px)` }}
      />
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
    current: "path-current bg-peach text-on-pastel",
    open: "bg-card text-ink",
    locked: "bg-card-2 text-muted",
  };
  return (
    <Link
      href={href}
      aria-label={`${index}. ${title} (${NODE_LABEL[state]})`}
      title={title}
      className={`raised flex h-[64px] w-[84px] items-center justify-center rounded-[50%] font-display text-2xl font-semibold ${look[state]}`}
    >
      {state === "done" ? (
        <Icon name="check" className="size-7" strokeWidth={2.5} />
      ) : state === "locked" ? (
        <LockIcon />
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
