"use client";

import { FUNNEL_OPTIONS, type AttemptSummary, type OnboardingAnswers } from "@speakup/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { PROBLEM_LABEL } from "@/learn/catalog";
import { averageSkills, recentProblems, scoreTrend } from "@/learn/progress";
import { learnKeys, useLearnData } from "@/learn/use-learn-data";
import { scoreSurface, SKILL_LABEL } from "@/lib/report";
import { useApi } from "@/lib/use-api";

export function ProfileView() {
  const { data, error, me, history } = useLearnData();

  if (error) {
    return (
      <p role="alert" className="font-medium text-danger">
        Couldn’t load your profile: {error.message}
      </p>
    );
  }
  if (!data || !me) return <p className="text-muted">Loading your profile…</p>;

  const completed = history.filter((a) => a.status === "completed");
  const best = completed.reduce((max, a) => Math.max(max, a.overallScore ?? 0), 0);
  const { level } = data;

  return (
    <>
      <header className="flex items-center gap-4">
        <Mascot mood="happy" size={72} />
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-none font-semibold tracking-tight">
            Profile
          </h1>
          <p className="truncate text-sm text-muted">{me.user.email ?? "Signed in"}</p>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className="pill bg-peach text-on-pastel capitalize">{me.entitlements.plan}</span>
            <Link
              href={me.entitlements.plan === "pro" ? "/app/billing" : "/pricing"}
              className="font-bold text-brand underline-offset-4 hover:underline"
            >
              {me.entitlements.plan === "pro" ? "Billing" : "Upgrade"}
            </Link>
          </p>
        </div>
      </header>

      <section aria-label="Stats" className="grid grid-cols-2 gap-2">
        <Tile value={`${data.streak}`} label="day streak" />
        <Tile value={`${completed.length}`} label="recordings analyzed" />
        <Tile value={best ? `${best}` : "—"} label="best score" />
        <Tile
          value={`Level ${level.level}`}
          label={`${data.xp} XP total`}
          bar={level.intoLevel / level.perLevel}
        />
      </section>

      <GoalPicker current={data.goal} onboarding={me.user.onboarding} />
      <Skills history={history} />
      <Trend history={history} />
      <Focus history={history} />
      <Recent history={history} />

      <p className="text-center text-xs text-muted">
        {me.usage.analysesToday} / {me.entitlements.dailyAnalysesLimit} analyses used today · member
        since {new Date(me.user.createdAt).toLocaleDateString()}
      </p>
    </>
  );
}

function Tile({ value, label, bar }: { value: string; label: string; bar?: number }) {
  return (
    <div className="surface flex flex-col gap-1 rounded-[22px] p-4 shadow-soft">
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
      {bar !== undefined && (
        <span className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-2" aria-hidden>
          <span
            className="block h-full rounded-full bg-ink"
            style={{ width: `${Math.round(bar * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

/** Changing the goal reorders the Learn tab (the goal's course leads). */
function GoalPicker({
  current,
  onboarding,
}: {
  current: string | undefined;
  onboarding: OnboardingAnswers | null;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (goal: string) =>
      api.saveOnboarding({
        answers: { ...onboarding, goal },
      }),
    onSuccess: (me) => queryClient.setQueryData(learnKeys.me, me),
  });

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Your goal</h2>
      <p className="text-sm text-muted">We put the course for your goal first.</p>
      <div className="flex flex-wrap gap-2">
        {FUNNEL_OPTIONS.goal.map((o) => {
          const active = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              disabled={save.isPending}
              onClick={() => save.mutate(o.value)}
              className={`min-h-10 rounded-full border-[1.5px] px-4 text-sm font-bold transition-colors disabled:opacity-60 ${
                active
                  ? "border-transparent bg-peach text-on-pastel"
                  : "border-line-2 bg-card-2 text-ink hover:border-peach"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {save.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          Couldn’t save your goal. Please try again.
        </p>
      )}
    </section>
  );
}

function Skills({ history }: { history: AttemptSummary[] }) {
  const skills = averageSkills(history);
  if (skills.length === 0) return null;
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Your skills</h2>
      <p className="text-sm text-muted">Average of your last 10 analyses.</p>
      <ul aria-label="Skill scores" className="flex flex-col gap-2.5">
        {skills.map(({ skill, score }) => (
          <li key={skill} className="grid grid-cols-[7.5rem_1fr_2.25rem] items-center gap-3">
            <span className="text-sm font-bold">{SKILL_LABEL[skill]}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-card-2" aria-hidden>
              <span
                className={`block h-full rounded-full ${scoreSurface(score)}`}
                style={{ width: `${Math.max(4, score)}%` }}
              />
            </span>
            <span className="text-right text-sm font-bold tabular-nums">
              {score}
              <span className="sr-only"> out of 100</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Trend({ history }: { history: AttemptSummary[] }) {
  const scores = scoreTrend(history);
  if (scores.length < 2) return null;
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Score trend</h2>
      <p className="sr-only">Recent scores, oldest to newest: {scores.join(", ")}</p>
      <div className="flex h-28 items-end gap-1.5" aria-hidden>
        {scores.map((score, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-lg ${scoreSurface(score)}`}
            style={{ height: `${Math.max(6, score)}%` }}
            title={`${score}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted">Last {scores.length} analyses, oldest → newest.</p>
    </section>
  );
}

function Focus({ history }: { history: AttemptSummary[] }) {
  const problems = recentProblems(history).slice(0, 4);
  if (problems.length === 0) return null;
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Working on</h2>
      <ul className="flex flex-wrap gap-2">
        {problems.map(({ problem, count }) => (
          <li key={problem} className="pill bg-lav text-on-pastel">
            {PROBLEM_LABEL[problem]} · {count}×
          </li>
        ))}
      </ul>
      <Link href="/app" className="link w-fit text-sm font-bold">
        See the lessons that fix these →
      </Link>
    </section>
  );
}

const humanize = (slug: string) =>
  slug.replace(/^(drill|legend|challenge|check)-/, "").replace(/-/g, " ");

function Recent({ history }: { history: AttemptSummary[] }) {
  const recent = history.slice(0, 8);
  if (recent.length === 0) return null;
  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">Recent recordings</h2>
      <ul className="flex flex-col divide-y divide-line">
        {recent.map((a) => (
          <li key={a.id}>
            <Link
              href={`/results/${a.id}`}
              className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-brand"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold capitalize">
                  {humanize(a.exerciseSlug)}
                </span>
                <span className="text-xs text-muted">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </span>
              {a.overallScore !== null ? (
                <span className={`pill ${scoreSurface(a.overallScore)} text-on-pastel`}>
                  {a.overallScore}
                </span>
              ) : (
                <span className="pill bg-card-2 text-muted">{a.status}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
