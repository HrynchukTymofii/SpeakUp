"use client";

import Link from "next/link";
import { useState } from "react";
import { Mascot } from "@/components/mascot";
import { COURSE_META, DEFAULT_META, PROBLEM_LABEL } from "@/learn/catalog";
import type { LearnCourse, Suggestion } from "@/learn/personalize";
import { DAILY_GOAL, lessonState, pathStates, type PathState } from "@/learn/progress";
import { TONE_SURFACE } from "@/learn/tone";
import { useLearnData, type LearnData } from "@/learn/use-learn-data";
import { BaselineCard } from "./baseline-card";

export function LearnView() {
  const { data, error } = useLearnData();

  if (error) {
    return (
      <p role="alert" className="font-medium text-danger">
        Couldn’t load your lessons: {error.message}
      </p>
    );
  }
  if (!data) return <p className="text-muted">Loading your lessons…</p>;

  return (
    <>
      <StatsBar data={data} />
      {!data.hasAnalysis && <FirstStep />}
      {data.suggestions.length > 0 && <Suggestions suggestions={data.suggestions} />}
      <CoursePicker data={data} />
    </>
  );
}

function StatsBar({ data }: { data: LearnData }) {
  const { streak, level, today } = data;
  return (
    <section aria-label="Your progress" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Keep going</p>
          <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">
            Learn
          </h1>
        </div>
        <Mascot mood={today >= DAILY_GOAL ? "happy" : "idle"} size={64} />
      </div>
      <ul className="grid grid-cols-3 gap-2 text-center">
        <Stat value={`🔥 ${streak}`} label={streak === 1 ? "day streak" : "day streak"} />
        <Stat
          value={`⚡ ${level.level}`}
          label={`level · ${level.intoLevel}/${level.perLevel} XP`}
        />
        <Stat value={`🎯 ${Math.min(today, DAILY_GOAL)}/${DAILY_GOAL}`} label="today" />
      </ul>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <li className="rounded-[20px] border border-line bg-card px-2 py-3">
      <p className="font-display text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </li>
  );
}

/** Before the first analysis: the speaking check tells us what to suggest. */
function FirstStep() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Start here</h2>
      <p className="text-sm text-muted">
        Take the speaking check — we’ll pick the lessons that fix what we hear.
      </p>
      <BaselineCard />
    </section>
  );
}

function Suggestions({ suggestions }: { suggestions: Suggestion[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="picked-heading">
      <h2 id="picked-heading" className="font-display text-xl font-semibold">
        Picked for you
      </h2>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => {
          const meta = COURSE_META[s.course.slug] ?? DEFAULT_META;
          return (
            <li key={s.lesson.slug}>
              <Link
                href={`/app/lessons/${s.lesson.slug}`}
                className="flex items-center gap-3 rounded-[22px] border-[1.5px] border-line-2 bg-card p-3 transition-colors hover:border-peach"
              >
                <span
                  aria-hidden
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${TONE_SURFACE[meta.tone]}`}
                >
                  {meta.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{s.lesson.title}</span>
                  <span className="text-xs font-semibold text-muted">
                    {s.source === "analysis" ? "We heard: " : "You told us: "}
                    {PROBLEM_LABEL[s.problem].toLowerCase()}
                  </span>
                </span>
                {s.lesson.locked && <span className="pill bg-card-2 text-muted">Pro</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CoursePicker({ data }: { data: LearnData }) {
  const [selected, setSelected] = useState(data.courses[0]?.slug);
  const course = data.courses.find((c) => c.slug === selected) ?? data.courses[0];
  if (!course) return null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="courses-heading">
      <h2 id="courses-heading" className="font-display text-xl font-semibold">
        Courses
      </h2>
      {/* Horizontal chips; the page itself never scrolls sideways (375 px rule). */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-1">
        <ul className="flex w-max gap-2" role="list">
          {data.courses.map((c) => {
            const meta = COURSE_META[c.slug] ?? DEFAULT_META;
            const active = c.slug === course.slug;
            return (
              <li key={c.slug}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(c.slug)}
                  className={`flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-sm font-bold whitespace-nowrap transition-colors ${
                    active
                      ? `border-transparent ${TONE_SURFACE[meta.tone]}`
                      : "border-line-2 bg-card text-ink hover:bg-card-2"
                  }`}
                >
                  <span aria-hidden>{meta.icon}</span>
                  {c.title}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <CoursePath
        course={course}
        completed={data.completed}
        isGoal={course === data.courses[0] && !!data.goal}
      />
    </section>
  );
}

/** Zig-zag offsets (px) for the path nodes, like a winding trail. */
const OFFSETS = [0, 44, 64, 44, 0, -44, -64, -44];

function CoursePath({
  course,
  completed,
  isGoal,
}: {
  course: LearnCourse;
  completed: Set<string>;
  isGoal: boolean;
}) {
  const meta = COURSE_META[course.slug] ?? DEFAULT_META;
  const lessonStates = course.lessons.map((l) => lessonState(l.exerciseSlugs, completed));
  const states = pathStates(
    course.lessons.map((l, i) => ({ state: lessonStates[i] ?? "new", locked: l.locked })),
  );
  const doneCount = states.filter((s) => s === "done").length;

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`flex flex-col gap-1 rounded-[28px] p-5 shadow-soft ${TONE_SURFACE[meta.tone]}`}
      >
        {isGoal && (
          <p className="text-[11.5px] font-extrabold tracking-[0.12em] uppercase">Your goal</p>
        )}
        <h3 className="font-display text-2xl leading-tight font-semibold">
          <span aria-hidden>{meta.icon} </span>
          {course.title}
        </h3>
        <p className="text-sm text-on-pastel-muted">{course.summary}</p>
        <p className="mt-1 text-sm font-bold">
          {doneCount} / {course.lessons.length} lessons done
        </p>
      </div>

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
