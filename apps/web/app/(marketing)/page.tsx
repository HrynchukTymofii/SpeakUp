import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { appHref } from "@/lib/links";
import { installHref } from "@/lib/pwa/install-href";
import { ArrowIcon, FeedbackIcon, HeroPhone, LessonArt, StepVisual } from "./landing-visuals";

// The three steps restate the value proposition — no new claims or numbers.
const STEPS = [
  { title: "Record yourself", body: "Speak for 45 seconds, right in your browser." },
  { title: "Get clear feedback", body: "Your pace, pauses, filler words and clarity." },
  { title: "Practice daily", body: "Short lessons that build on your results." },
] as const;

const METRICS = [
  {
    icon: "pace",
    title: "Pace",
    body: "How fast you speak, and whether it helps the listener follow.",
  },
  {
    icon: "pause",
    title: "Pauses",
    body: "Where you stop, and whether the silence works for you.",
  },
  { icon: "filler", title: "Filler words", body: "Every “um”, “like” and “you know”, counted." },
  { icon: "clarity", title: "Clarity", body: "Whether your point comes through." },
] as const;

// Real lessons from the catalog (learn/catalog.ts), so the page never promises one we lack.
const LESSONS = [
  {
    art: "pause",
    title: "The power of the pause",
    body: "Swap “um” for a short silence. It sounds more sure of itself.",
  },
  {
    art: "pace",
    title: "Find your pace",
    body: "A speed people can follow, and how to keep it under pressure.",
  },
  {
    art: "breath",
    title: "Square breathing",
    body: "Calm your voice before you speak, so the first sentence comes out steady.",
  },
] as const;

const CHECK = "Take the 2-minute speaking check";

// Landing (SPEC §11): value proposition + CTA into the funnel, in the "Glow" look
// (docs/design-system.md). TODO(founder): social proof once real — no invented numbers.
export default function HomePage() {
  return (
    <main className="relative isolate overflow-x-clip">
      {/* The one soft lavender glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px] bg-[radial-gradient(60%_60%_at_20%_0%,var(--glow),transparent_70%),radial-gradient(40%_50%_at_90%_20%,var(--glow),transparent_70%)]"
      />

      <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 pt-10 pb-10 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
        <div>
          <h1 className="font-sans text-[46px] leading-none font-light tracking-[-0.035em] sm:text-7xl lg:text-[84px]">
            Speak with <b className="font-bold">confidence</b>
          </h1>
          <p className="mt-4 text-xl font-light tracking-tight text-muted sm:text-2xl">
            in interviews, meetings and on stage.
          </p>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-muted">
            Record yourself for 45 seconds and get clear feedback on your pace, pauses, filler words
            and clarity. Then practice with short daily lessons.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <a
              href={appHref("/start")}
              className="btn btn-ink min-h-14 w-full px-5 text-[15px] whitespace-nowrap sm:w-auto sm:px-7 sm:text-base"
            >
              {CHECK}
              <ArrowIcon />
            </a>
            {/* The app is installable only on the app host, so the offer lives there. */}
            <a
              href={appHref(installHref("landing"))}
              className="btn btn-secondary min-h-14 w-full px-5 text-[15px] sm:w-auto sm:px-7 sm:text-base"
            >
              <Icon name="download" className="size-5" />
              Download the app
            </a>
            <a href={appHref("/app")} className="link py-1 text-sm font-semibold">
              Already have an account? Go to your dashboard
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2">
            {["2 minutes", "Right in your browser", "Just your voice"].map((fact) => (
              <li
                key={fact}
                className="surface flex items-center gap-2 rounded-full py-2 pr-4 pl-3 text-sm font-semibold shadow-soft-sm"
              >
                <span aria-hidden className="size-2 rounded-full bg-brand" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <HeroPhone />
      </div>

      <section
        id="how"
        aria-labelledby="how-title"
        className="mx-auto max-w-5xl px-4 py-14 sm:py-20"
      >
        <SectionHead id="how-title" light="How it" bold="works">
          Three steps. The first one takes two minutes.
        </SectionHead>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const dark = i === 1;
            return (
              <li
                key={step.title}
                className={`flex flex-col gap-4 rounded-[28px] p-6 sm:min-h-64 ${
                  dark ? "surface-ink" : "surface shadow-soft"
                }`}
              >
                <span
                  className={`grid size-9 place-items-center rounded-full text-sm font-bold ${
                    dark ? "bg-white/15" : "bg-card-2"
                  }`}
                >
                  {i + 1}
                </span>
                <StepVisual step={i} />
                <h3 className="mt-auto font-sans text-2xl font-bold tracking-tight">
                  {step.title}
                </h3>
                <p className={dark ? "text-white/70" : "text-muted"}>{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        id="feedback"
        aria-labelledby="feedback-title"
        className="mx-auto max-w-5xl px-4 py-14 sm:py-20"
      >
        <SectionHead id="feedback-title" light="Feedback you can" bold="act on">
          Not a vague grade. Four things you can hear, and one thing to try next time.
        </SectionHead>
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="surface flex flex-col gap-6 rounded-[28px] p-6 shadow-soft sm:p-8">
            {METRICS.map((m) => (
              <li key={m.title} className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lav text-brand">
                  <FeedbackIcon name={m.icon} />
                </span>
                <div>
                  <h3 className="font-sans text-[17px] font-bold">{m.title}</h3>
                  <p className="text-[15px] text-muted">{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="surface relative isolate flex flex-col gap-4 overflow-hidden rounded-[28px] p-6 shadow-soft sm:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_50%_0%,var(--glow),transparent_70%)]"
            />
            <span className="self-start rounded-full bg-card-2 px-3 py-1 text-xs font-bold text-muted">
              Example result
            </span>
            <p className="text-[112px] leading-[0.85] font-light tracking-[-0.06em]">
              72<span className="text-[28px] tracking-normal text-muted">/100</span>
            </p>
            <dl className="rounded-[20px] bg-card px-5 py-1 shadow-soft-sm">
              {[
                ["Pace", "168 words a minute"],
                ["Filler words", "6"],
                ["Long pauses", "2"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between border-line py-3 text-[15px] font-semibold not-first:border-t"
                >
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-[18px] bg-lav px-4 py-3 text-[15px]">
              <b className="block">Try this next</b>
              Take one slow breath before your example. It slows the next sentence down.
            </p>
          </div>
        </div>
      </section>

      <section
        id="lessons"
        aria-labelledby="lessons-title"
        className="mx-auto max-w-5xl px-4 py-14 sm:py-20"
      >
        <SectionHead id="lessons-title" light="Short lessons," bold="built on your results">
          A short lesson, then you try it out loud. A few minutes a day.
        </SectionHead>
        <ul className="grid gap-4 md:grid-cols-3">
          {LESSONS.map((lesson) => (
            <li
              key={lesson.title}
              className="surface flex flex-col overflow-hidden rounded-[28px] shadow-soft"
            >
              <LessonArt kind={lesson.art} />
              <div className="relative -mt-6 flex flex-1 flex-col gap-2 rounded-t-3xl bg-card px-5 pt-3 pb-6">
                <span aria-hidden className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-2" />
                <h3 className="font-sans text-xl font-bold tracking-tight">{lesson.title}</h3>
                <p className="text-[15px] text-muted">{lesson.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="final-title" className="mx-auto max-w-5xl px-4 pt-4 pb-16 sm:pb-24">
        <div className="surface-ink relative isolate overflow-hidden rounded-[36px] px-6 py-12 text-center sm:px-10 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1/2 left-1/2 -z-10 h-full w-3/4 -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(169,150,255,0.35),transparent)]"
          />
          <Mascot mood="happy" size={64} className="mx-auto mb-4" />
          <h2
            id="final-title"
            className="font-sans text-[34px] leading-tight font-light tracking-[-0.035em] sm:text-5xl"
          >
            Find out how you <b className="font-bold">really sound</b>
          </h2>
          <p className="mx-auto mt-4 mb-7 max-w-[44ch] text-white/70">
            Two minutes, your voice, and a clear picture of what to work on first.
          </p>
          <a
            href={appHref("/start")}
            className="btn surface min-h-14 w-full px-5 text-[15px] whitespace-nowrap text-ink shadow-soft sm:w-auto sm:px-7 sm:text-base"
          >
            {CHECK}
            <ArrowIcon />
          </a>
        </div>
      </section>
    </main>
  );
}

function SectionHead({
  id,
  light,
  bold,
  children,
}: {
  id: string;
  light: string;
  bold: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-8 max-w-2xl sm:mb-10">
      <h2
        id={id}
        className="font-sans text-[34px] leading-[1.08] font-light tracking-[-0.035em] sm:text-5xl"
      >
        {light} <b className="font-bold">{bold}</b>
      </h2>
      <p className="mt-3 text-[17px] text-muted">{children}</p>
    </div>
  );
}
