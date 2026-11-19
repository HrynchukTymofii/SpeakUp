"use client";

import Link from "next/link";
import { IconTile, PlayCircle } from "@/components/icon-tile";
import { Mascot } from "@/components/mascot";
import { COURSE_META, DEFAULT_META, PROBLEM_LABEL } from "@/learn/catalog";
import type { Suggestion } from "@/learn/personalize";
import { DAILY_GOAL, lessonState, nextUp } from "@/learn/progress";
import { TONE_SURFACE } from "@/learn/tone";
import { useLearnData, type LearnData } from "@/learn/use-learn-data";
import { BaselineCard } from "./baseline-card";

/**
 * Learn tab, in the SAT Learner look: level / streak / today on top, one big "continue" card,
 * lessons picked from what we heard, and the courses as cards.
 */
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
      <StatusBar data={data} />
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[34px] leading-[1.02] font-semibold tracking-tight">
          Let’s speak up.
        </h1>
        <Mascot mood={data.today >= DAILY_GOAL ? "happy" : "idle"} size={64} />
      </header>
      {data.hasAnalysis ? <ContinueCard data={data} /> : <BaselineCard />}
      {data.suggestions.length > 0 && <Suggestions suggestions={data.suggestions} />}
      <CourseGrid data={data} />
    </>
  );
}

/** Level, streak and today's goal: the game layer, always at the top. */
export function StatusBar({ data }: { data: LearnData }) {
  const { streak, level, today } = data;
  const doneToday = Math.min(today, DAILY_GOAL);
  return (
    <section
      aria-label="Your progress"
      className="flex items-center justify-between font-display text-lg font-bold tabular-nums"
    >
      <span title={`${level.intoLevel}/${level.perLevel} XP to the next level`}>
        LVL {level.level}
      </span>
      <span aria-label={`${streak} day streak`}>
        <span aria-hidden>🔥</span> {streak}
      </span>
      <span aria-label={`${doneToday} of ${DAILY_GOAL} recordings today`}>
        <span aria-hidden>⚡</span> {doneToday}/{DAILY_GOAL}
      </span>
    </section>
  );
}

function ContinueCard({ data }: { data: LearnData }) {
  const up = nextUp(data.courses, data.completed);
  if (!up) return null;
  const { course, lesson, number, done } = up;
  const percent = Math.round((done / course.lessons.length) * 100);
  return (
    <section className="paper flex flex-col gap-4 rounded-[28px] bg-butter p-5 text-on-pastel shadow-soft">
      <p className="text-sm font-bold">
        {course.title} · Lesson {number} of {course.lessons.length}
      </p>
      <h2 className="font-display text-[30px] leading-[1.05] font-semibold">{lesson.title}</h2>
      <div className="flex items-center gap-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-on-pastel/15" aria-hidden>
          <span
            className="block h-full rounded-full bg-on-pastel"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="text-sm font-bold tabular-nums">{percent}%</span>
      </div>
      <Link
        href={`/app/lessons/${lesson.slug}`}
        className="flex items-center justify-between rounded-full bg-white py-2 pr-2 pl-5 font-bold text-on-pastel shadow-soft-sm"
      >
        Continue lesson
        <PlayCircle />
      </Link>
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
                className="flex items-center gap-3 rounded-[22px] bg-card p-3 shadow-soft-sm transition-transform active:scale-[0.98]"
              >
                <IconTile icon={meta.icon} surface={TONE_SURFACE[meta.tone]} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{s.lesson.title}</span>
                  <span className="text-xs font-semibold text-muted">
                    {PROBLEM_LABEL[s.problem]}
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
                className="flex h-full min-h-44 flex-col justify-between gap-3 rounded-[24px] bg-card p-4 shadow-soft-sm transition-transform active:scale-[0.98]"
              >
                <span className="flex items-start justify-between gap-2">
                  <IconTile icon={meta.icon} surface={TONE_SURFACE[meta.tone]} />
                  {i === 0 && data.goal && <span className="pill bg-ink text-page">Goal</span>}
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
                      className="block h-full rounded-full bg-ink"
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
