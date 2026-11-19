"use client";

import type { Exercise } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { DRILL_INFO, drillKind, feedExercises, type DrillKind } from "@/learn/practice";
import { TONE_SURFACE } from "@/learn/tone";
import { learnKeys } from "@/learn/use-learn-data";
import { useApi } from "@/lib/use-api";

const todaySeed = () => new Date().toDateString();

/**
 * A vertical, snap-scrolling feed of short drills — swipe to the next one like a short-video
 * app, record without leaving the feed. Each card is one screen tall.
 */
export function PracticeFeed() {
  const api = useApi();
  const practice = useQuery({
    queryKey: learnKeys.practice,
    queryFn: () => api.getPracticeExercises(),
  });
  const [kind, setKind] = useState<DrillKind | undefined>();
  const items = useMemo(
    () => (practice.data ? feedExercises(practice.data.exercises, todaySeed(), kind) : []),
    [practice.data, kind],
  );

  if (practice.isPending) return <p className="text-muted">Loading drills…</p>;
  if (practice.isError) {
    return (
      <p role="alert" className="font-medium text-danger">
        Couldn’t load the drills: {practice.error.message}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[28px] leading-none font-semibold tracking-tight">
          Practice
        </h1>
        <p className="text-xs font-semibold text-muted">Swipe up for the next drill</p>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2" role="list">
          <FilterChip active={!kind} onClick={() => setKind(undefined)}>
            All
          </FilterChip>
          {(Object.keys(DRILL_INFO) as DrillKind[]).map((k) => (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
              {DRILL_INFO[k].icon} {DRILL_INFO[k].label}
            </FilterChip>
          ))}
        </ul>
      </div>

      {/* Height = viewport minus header (3.5rem), title + chips (~6rem) and tab bar (4rem). */}
      <ol
        aria-label="Drills"
        className="flex h-[calc(100dvh-14rem)] snap-y snap-mandatory flex-col gap-4 overflow-y-auto overscroll-contain"
      >
        {items.map((exercise, i) => (
          <li key={exercise.id} className="h-full shrink-0 snap-start">
            <DrillCard exercise={exercise} position={i + 1} total={items.length} />
          </li>
        ))}
      </ol>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`min-h-10 rounded-full border-[1.5px] px-4 text-sm font-bold whitespace-nowrap transition-colors ${
          active ? "border-transparent bg-ink text-page" : "border-line-2 bg-card text-ink"
        }`}
      >
        {children}
      </button>
    </li>
  );
}

function DrillCard({
  exercise,
  position,
  total,
}: {
  exercise: Exercise;
  position: number;
  total: number;
}) {
  const kind = drillKind(exercise.slug) ?? "topic";
  const info = DRILL_INFO[kind];
  return (
    <article
      aria-label={`${info.label}, drill ${position} of ${total}`}
      className="flex h-full flex-col gap-4 overflow-y-auto rounded-[28px] border border-line bg-card p-5 shadow-soft"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`pill ${TONE_SURFACE[info.tone]}`}>
          <span aria-hidden>{info.icon}</span> {info.label}
        </span>
        <span className="text-xs font-semibold text-muted tabular-nums">
          {position} / {total}
        </span>
      </div>
      <p className="font-display text-[26px] leading-tight font-semibold">{exercise.prompt}</p>
      {exercise.referenceText && (
        <blockquote className="rounded-3xl bg-butter p-5 text-[17px] leading-relaxed font-medium text-on-pastel">
          {exercise.referenceText}
        </blockquote>
      )}
      <p className="text-sm text-muted">{info.why}</p>
      <div className="mt-auto">
        <ExerciseRecorder exercise={exercise} afterSubmit="stay" />
      </div>
    </article>
  );
}
