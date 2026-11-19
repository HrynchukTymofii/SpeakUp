"use client";

import type { Exercise } from "@speakup/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ExerciseRecorder } from "@/components/exercise-recorder";
import { Mascot } from "@/components/mascot";
import { useMyStory } from "@/learn/local-progress";
import { legendTitle } from "@/learn/practice";
import { STORY_CHALLENGE_DAYS, STORY_CHALLENGE_SLUG, storyChallenge } from "@/learn/progress";
import { learnKeys, useLearnData } from "@/learn/use-learn-data";
import { useApi } from "@/lib/use-api";

export function ChallengesView() {
  const api = useApi();
  const practice = useQuery({
    queryKey: learnKeys.practice,
    queryFn: () => api.getPracticeExercises(),
  });
  const { history } = useLearnData();

  const exercises = practice.data?.exercises ?? [];
  const story = exercises.find((e) => e.slug === STORY_CHALLENGE_SLUG);
  const legends = exercises.filter((e) => e.slug.startsWith("legend-"));

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Push yourself</p>
          <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">
            Challenges
          </h1>
        </div>
        <Mascot mood="happy" size={64} />
      </header>

      {practice.isError && (
        <p role="alert" className="font-medium text-danger">
          Couldn’t load the challenges: {practice.error.message}
        </p>
      )}
      {practice.isPending && <p className="text-muted">Loading challenges…</p>}

      {story && <StoryChallenge exercise={story} history={history} />}
      {legends.length > 0 && <Legends legends={legends} />}
      <Contests />
    </>
  );
}

function StoryChallenge({
  exercise,
  history,
}: {
  exercise: Exercise;
  history: ReturnType<typeof useLearnData>["history"];
}) {
  const [story] = useMyStory();
  const [recording, setRecording] = useState(false);
  const { daysDone, doneToday, scores } = storyChallenge(history);
  const finished = daysDone >= STORY_CHALLENGE_DAYS;

  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-peach p-5 text-on-pastel shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="text-[11.5px] font-extrabold tracking-[0.12em] uppercase">7-day challenge</p>
        <h2 className="font-display text-2xl leading-tight font-semibold">Own your story</h2>
        <p className="text-sm text-on-pastel-muted">
          Tell the same story — the one you wrote — once a day for a week. By day 7 it’s yours: use
          it in a real conversation.
        </p>
      </div>

      <ol className="grid grid-cols-7 gap-1.5" aria-label={`${daysDone} of 7 days done`}>
        {Array.from({ length: STORY_CHALLENGE_DAYS }, (_, i) => {
          const done = i < daysDone;
          return (
            <li
              key={i}
              className={`flex aspect-square flex-col items-center justify-center rounded-2xl text-xs font-extrabold ${
                done ? "bg-on-pastel text-peach" : "border-[1.5px] border-on-pastel/25"
              }`}
            >
              <span>{done ? "✓" : i + 1}</span>
              {done && scores[i] !== undefined && (
                <span className="text-[10px] tabular-nums opacity-80">{scores[i]}</span>
              )}
            </li>
          );
        })}
      </ol>

      {story ? (
        <details className="rounded-2xl bg-on-pastel/10 p-3 text-sm">
          <summary className="cursor-pointer font-bold">Your story (written by you)</summary>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap">{story}</p>
        </details>
      ) : (
        <p className="text-sm">
          First write your story in{" "}
          <Link href="/app/lessons/your-story" className="font-bold underline">
            Build your story
          </Link>
          .
        </p>
      )}

      {finished ? (
        <p className="rounded-2xl bg-on-pastel/10 p-3 font-bold">
          🎉 Seven days done! Now the real test: tell it in your next conversation.
        </p>
      ) : doneToday ? (
        <p className="font-bold">
          Day {daysDone} done ✓ — come back tomorrow for day {daysDone + 1}.
        </p>
      ) : recording ? (
        <div className="rounded-[22px] bg-card p-4 text-ink">
          <ExerciseRecorder exercise={exercise} afterSubmit="stay" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="btn bg-on-pastel text-peach hover:opacity-90"
        >
          Record day {daysDone + 1}
        </button>
      )}
    </section>
  );
}

function Legends({ legends }: { legends: Exercise[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="legends-heading">
      <div>
        <h2 id="legends-heading" className="font-display text-xl font-semibold">
          Speak like a legend
        </h2>
        <p className="text-sm text-muted">
          Deliver a famous speech and see how your pauses, pace and voice compare.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {legends.map((legend) => {
          const isOpen = open === legend.slug;
          const who = legendTitle(legend.prompt);
          return (
            <li key={legend.slug} className="card flex flex-col gap-3">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : legend.slug)}
                className="flex items-center justify-between gap-3 text-left"
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-11 items-center justify-center rounded-2xl bg-lav text-xl text-on-pastel"
                  >
                    🏛️
                  </span>
                  <span className="font-display text-lg font-semibold">{who}</span>
                </span>
                <span aria-hidden className="text-muted">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <>
                  <p className="text-sm text-muted">{legend.prompt}</p>
                  <blockquote className="rounded-3xl bg-butter p-5 text-[17px] leading-relaxed font-medium text-on-pastel">
                    {legend.referenceText}
                  </blockquote>
                  <ExerciseRecorder exercise={legend} />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="rounded-2xl border border-dashed border-line-2 p-3 text-xs text-muted">
        Coming soon: play the original recording, see your delivery side by side with the speaker’s,
        and share your score.
      </p>
    </section>
  );
}

function Contests() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-[28px] border border-dashed border-line-2 bg-card p-5">
      <span className="pill bg-sky text-on-pastel">Coming soon</span>
      <h2 className="font-display text-xl font-semibold">Contests</h2>
      <p className="text-sm text-muted">
        Weekly speaking contests: everyone gets the same prompt — the best 60-second pitch, the
        funniest “convince me” — and the community votes. Leaderboards, badges and bragging rights.
      </p>
    </section>
  );
}
