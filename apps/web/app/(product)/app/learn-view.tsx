"use client";

import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { COURSE_META, DEFAULT_META, PROBLEM_LABEL } from "@/learn/catalog";
import type { Suggestion } from "@/learn/personalize";
import { DAILY_GOAL, lessonState } from "@/learn/progress";
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
      <CourseGrid data={data} />
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

function CourseGrid({ data }: { data: LearnData }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="courses-heading">
      <h2 id="courses-heading" className="font-display text-xl font-semibold">
        Courses
      </h2>
      <ul className="grid grid-cols-2 gap-3">
        {data.courses.map((course, i) => {
          const meta = COURSE_META[course.slug] ?? DEFAULT_META;
          const done = course.lessons.filter(
            (l) => lessonState(l.exerciseSlugs, data.completed) === "done",
          ).length;
          const total = course.lessons.length;
          return (
            <li key={course.slug}>
              <Link
                href={`/app/courses/${course.slug}`}
                className="flex h-full min-h-40 flex-col justify-between gap-3 rounded-[24px] border border-line bg-card p-4 transition-colors hover:border-peach active:scale-[0.98]"
              >
                <span className="flex items-start justify-between gap-2">
                  <span aria-hidden className="text-3xl">
                    {meta.icon}
                  </span>
                  {i === 0 && data.goal && (
                    <span className="pill bg-peach text-on-pastel">Your goal</span>
                  )}
                </span>
                <span className="flex flex-col gap-2">
                  <span className="font-display text-lg leading-tight font-semibold">
                    {course.title}
                  </span>
                  <span
                    className="h-1.5 overflow-hidden rounded-full bg-card-2"
                    role="progressbar"
                    aria-label={`${done} of ${total} lessons done`}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={done}
                  >
                    <span
                      className="block h-full rounded-full bg-peach"
                      style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="text-xs font-semibold text-muted tabular-nums">
                    {done}/{total} lessons
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
