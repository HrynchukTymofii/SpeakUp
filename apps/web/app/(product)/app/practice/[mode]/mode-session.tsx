"use client";

import type { PracticeMode } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { MODE_INFO } from "@/learn/practice";
import { TONE_SURFACE } from "@/learn/tone";
import { useApi } from "@/lib/use-api";
import { Icon } from "@/components/icons";

/**
 * A practice mode, started right away: one random topic the user hasn't done yet, the recorder,
 * and "another topic" to pass on it. After the recording, the results page's "Continue" comes
 * back here for the next topic.
 */
export function ModeSession({ mode }: { mode: PracticeMode }) {
  const api = useApi();
  const info = MODE_INFO[mode];
  const [skip, setSkip] = useState<string | undefined>();
  const next = useQuery({
    queryKey: ["practice-next", mode, skip],
    queryFn: () => api.getNextTopic(mode, skip),
    // The pick is random: never re-pick behind the user's back (refocus, remount while
    // recording). Dropped on leaving, so coming back after a recording gets a new topic.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/app/practice"
          aria-label="Close"
          className="link flex size-10 items-center justify-center text-2xl leading-none font-bold"
        >
          ×
        </Link>
        <p className="flex items-center gap-2 font-bold">
          <Icon name={info.icon} className="size-5 text-brand" />
          {info.label}
        </p>
        <span className="w-10 text-right text-xs font-semibold text-muted tabular-nums">
          {next.data && `${next.data.done}/${next.data.total}`}
        </span>
      </div>

      {next.isPending && <p className="text-muted">Picking a topic…</p>}
      {next.isError && (
        <p role="alert" className="font-medium text-danger">
          Couldn’t load a topic: {next.error.message}
        </p>
      )}

      {next.data && (
        <>
          <section
            className={`flex min-h-52 flex-col justify-center gap-3 rounded-[28px] p-6 text-center shadow-soft ${TONE_SURFACE[info.tone]}`}
          >
            <p className="text-[11.5px] font-extrabold tracking-[0.12em] uppercase">
              {mode === "twister" ? "Say it 3 times" : "Your topic"}
            </p>
            <p className="font-display text-[28px] leading-tight font-semibold">
              {next.data.topic}
            </p>
            <button
              type="button"
              onClick={() => setSkip(next.data.topic)}
              className="mx-auto rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-on-pastel hover:bg-white"
            >
              ↻ Another one
            </button>
          </section>
          <ExerciseRecorder
            key={next.data.topic}
            exercise={next.data.exercise}
            topic={next.data.topic}
            next={`/app/practice/${mode}`}
          />
        </>
      )}
    </>
  );
}
