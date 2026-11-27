"use client";

import Link from "next/link";
import { useState } from "react";
import { BoxBreathing } from "@/components/box-breathing";
import { Mascot } from "@/components/mascot";
import { CONFIDENCE_COURSE, type LocalLesson } from "@/learn/catalog";
import { useLocalDone } from "@/learn/local-progress";

/**
 * Confidence lessons that run fully in the app: what they train (breathing, mindset, body
 * language) can't be measured from audio yet. Finishing one is remembered on this device.
 */
export function LocalLessonView({ lesson }: { lesson: LocalLesson }) {
  const [, markDone] = useLocalDone();
  const [finished, setFinished] = useState(false);
  const finish = () => {
    markDone(lesson.slug);
    setFinished(true);
  };

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="eyebrow">{CONFIDENCE_COURSE.title}</p>
        <h1 className="font-display text-[30px] leading-[1.05] font-semibold tracking-tight">
          {lesson.title}
        </h1>
      </header>
      {finished ? (
        <Finished />
      ) : lesson.kind === "breathing" ? (
        <BoxBreathing onDone={finish} />
      ) : lesson.kind === "yes-button" ? (
        <YesButton onDone={finish} />
      ) : (
        <BodyTips onDone={finish} />
      )}
    </>
  );
}

function Finished() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[28px] bg-sage p-8 text-center text-on-pastel shadow-soft">
      <Mascot mood="happy" size={110} label="The mascot celebrates" />
      <h2 className="font-display text-3xl font-semibold">Done!</h2>
      <p className="text-on-pastel-muted">Use it right before your next call, talk or meeting.</p>
      <Link href="/app" className="btn w-full bg-on-pastel text-sage hover:opacity-90">
        Back to Learn
      </Link>
    </div>
  );
}

// --- The "Yes!" button -----------------------------------------------------------------------

const POWER_PHRASES = ["“Yes! Let’s go!”", "“Finally — my turn!”", "“I’m going to enjoy this!”"];

/**
 * A pre-talk ritual: switch from "I have to" to "I get to". Press the button, say the phrase
 * out loud with a gesture. Three presses and you're switched on.
 */
function YesButton({ onDone }: { onDone: () => void }) {
  const [presses, setPresses] = useState(0);
  const [pop, setPop] = useState(false);
  const phrase = POWER_PHRASES[presses % POWER_PHRASES.length];

  return (
    <div className="card flex flex-col items-center gap-5 text-center">
      <p className="text-sm text-muted">
        Right before you speak: lower the stakes, switch on the fun. Press the button, then say the
        phrase out loud — with a fist pump.
      </p>
      <button
        type="button"
        onClick={() => {
          setPresses((p) => p + 1);
          setPop(true);
          if (presses + 1 >= POWER_PHRASES.length) setTimeout(onDone, 900);
        }}
        onAnimationEnd={() => setPop(false)}
        className={`yes-button flex size-48 items-center justify-center rounded-full bg-peach font-display text-5xl font-semibold text-on-pastel shadow-peach ${pop ? "yes-pop" : ""}`}
      >
        YES!
      </button>
      <p aria-live="polite" className="font-display text-2xl font-semibold">
        Say: {phrase}
      </p>
      <p className="text-sm font-semibold text-muted">
        {presses} / {POWER_PHRASES.length}
      </p>
    </div>
  );
}

// --- Body language tips ----------------------------------------------------------------------

const TIPS = [
  {
    title: "Stand tall",
    body: "Feet under your shoulders, chest open, chin level. Your body tells your brain you’re fine — and the audience believes it too.",
  },
  {
    title: "Look at one person at a time",
    body: "Hold eye contact for a full thought, then move to someone else — including the people at the edges and the back.",
  },
  {
    title: "Let your hands talk",
    body: "Open gestures at chest height. Hold a gesture still for a beat on an important word; use your hands to show size, direction, contrast.",
  },
  {
    title: "Pick your energy level",
    body: "Imagine a dial from 0 (asleep) to 10 (stadium). Most talks live around 6. Move between 4 and 9 on purpose — the change is what keeps people awake.",
  },
];

function BodyTips({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const tip = TIPS[index] ?? TIPS[0]!;
  const last = index === TIPS.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <div key={index} className="funnel-forward card flex flex-col gap-3">
        <span className="pill w-fit bg-sky text-on-pastel">
          Tip {index + 1} of {TIPS.length}
        </span>
        <h2 className="font-display text-2xl font-semibold">{tip.title}</h2>
        <p className="leading-relaxed text-ink/90">{tip.body}</p>
        <p className="text-xs text-muted">
          We can’t see you yet — the mobile app will coach posture and gestures with the camera.
        </p>
      </div>
      <button
        type="button"
        onClick={() => (last ? onDone() : setIndex((i) => i + 1))}
        className="btn btn-primary w-full"
      >
        {last ? "Finish" : "Next tip"}
      </button>
    </div>
  );
}
