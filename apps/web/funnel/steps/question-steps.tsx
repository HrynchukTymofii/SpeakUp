"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { publicEnv } from "@/lib/env";
import { track } from "../analytics";
import { LessonVideo } from "../lesson-video";
import { OPTIONS_PROVIDERS, PERSONALIZERS, renderText } from "../personalize";
import { useFunnelStore } from "../store";
import { Card, ContinueButton, OptionButton, StepHeading, Tick } from "../ui";
import type { StepProps } from "./props";
import { Icon } from "@/components/icons";

/** Tiny haptic tick on phones that support it (like the reference funnel). */
function vibrate() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Not supported or blocked: no-op.
  }
}

/** One answer; tapping it saves and moves on immediately (no Continue needed). */
export function SingleChoiceStep({ step, ctx, onNext }: StepProps<"single_choice">) {
  const options = Array.isArray(step.options)
    ? step.options
    : OPTIONS_PROVIDERS[step.options.provider](ctx);
  const current = ctx.answers[step.answerKey];
  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title={renderText(step.title, ctx.answers)}
        subtitle={step.subtitle && renderText(step.subtitle, ctx.answers)}
      />
      <div className="flex flex-col gap-3">
        {options.map((option, i) => (
          <OptionButton
            key={option.value}
            index={i}
            label={option.label}
            selected={current === option.value}
            onClick={() => {
              vibrate();
              track("funnel_answer", { step: step.id, value: option.value });
              onNext({ [step.answerKey]: option.value });
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function MultiChoiceStep({ step, ctx, onNext }: StepProps<"multi_choice">) {
  const [picked, setPicked] = useState<string[]>(() => ctx.answers[step.answerKey] ?? []);
  const toggle = (value: string) =>
    setPicked((p) => (p.includes(value) ? p.filter((v) => v !== value) : [...p, value]));
  return (
    <div className="flex flex-1 flex-col gap-6">
      <StepHeading
        title={renderText(step.title, ctx.answers)}
        subtitle={step.subtitle && renderText(step.subtitle, ctx.answers)}
      />
      <div className="flex flex-col gap-3">
        {step.options.map((option, i) => (
          <OptionButton
            key={option.value}
            index={i}
            multi
            label={option.label}
            selected={picked.includes(option.value)}
            onClick={() => {
              vibrate();
              toggle(option.value);
            }}
          />
        ))}
      </div>
      <ContinueButton
        disabled={picked.length === 0}
        onClick={() => {
          track("funnel_answer", { step: step.id, value: picked });
          onNext({ [step.answerKey]: picked });
        }}
      />
    </div>
  );
}

/** 1–5 rating with a native range input (keyboard + screen-reader friendly). */
export function SliderStep({ step, ctx, onNext }: StepProps<"slider">) {
  const [value, setValue] = useState(ctx.answers[step.answerKey] ?? 3);
  const title = renderText(step.title, ctx.answers);
  return (
    <div className="flex flex-1 flex-col gap-8">
      <StepHeading title={title} />
      <Card className="flex flex-col gap-4 py-7">
        <p
          className="text-center font-display text-7xl leading-none font-semibold text-brand tabular-nums"
          aria-hidden
        >
          {value}
        </p>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label={title}
          aria-valuetext={`${value} out of 5`}
          className="h-2 w-full cursor-pointer accent-peach"
        />
        <div className="flex justify-between text-sm font-semibold text-muted">
          <span>{renderText(step.lowLabel, ctx.answers)}</span>
          <span>{renderText(step.highLabel, ctx.answers)}</span>
        </div>
      </Card>
      <ContinueButton
        onClick={() => {
          track("funnel_answer", { step: step.id, value });
          onNext({ [step.answerKey]: value });
        }}
      />
    </div>
  );
}

/** A calm screen between questions that reacts to an earlier answer. */
export function ReflectionStep({ step, ctx, onNext }: StepProps<"reflection">) {
  const markCompleted = useFunnelStore((s) => s.markCompleted);
  const { content } = step;
  const { title, body } =
    "personalizer" in content
      ? PERSONALIZERS[content.personalizer](ctx)
      : {
          title: renderText(content.title, ctx.answers),
          body: renderText(content.body, ctx.answers),
        };
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col justify-center gap-4 py-8">
        <Mascot mood="happy" size={112} className="-ml-2" />
        <h1 className="font-display text-[30px] leading-[1.1] font-semibold text-balance">
          {title}
        </h1>
        <p className="text-lg leading-relaxed text-muted">{body}</p>
      </div>
      <ContinueButton
        onClick={() => {
          markCompleted(step.id);
          onNext();
        }}
      />
    </div>
  );
}

/** Mini-lesson: Continue unlocks after `unlockAfterSec` or when the video ends. */
export function VideoLessonStep({ step, ctx, onNext }: StepProps<"video_lesson">) {
  const markCompleted = useFunnelStore((s) => s.markCompleted);
  const alreadyDone = useFunnelStore((s) => s.completed.includes(step.id));
  const [unlocked, setUnlocked] = useState(alreadyDone);
  const [secondsLeft, setSecondsLeft] = useState(step.unlockAfterSec);
  const videoUrl = publicEnv.NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL;

  useEffect(() => {
    if (unlocked) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setUnlocked(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [unlocked]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <StepHeading title={renderText(step.title, ctx.answers)} />
      {videoUrl ? (
        <LessonVideo src={videoUrl} onEnded={() => setUnlocked(true)} />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-card text-sm font-semibold text-muted">
          <Mascot mood="thinking" size={64} />
          Video coming soon
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {step.takeaways.map((t) => (
          <li key={t} className="flex gap-3 text-ink/90">
            <Tick />
            {renderText(t, ctx.answers)}
          </li>
        ))}
      </ul>
      <ContinueButton
        disabled={!unlocked}
        onClick={() => {
          markCompleted(step.id);
          onNext();
        }}
      >
        {unlocked ? "Continue" : `Continue in ${secondsLeft}s`}
      </ContinueButton>
    </div>
  );
}

type MicState = "idle" | "asking" | "denied" | "unsupported";

/** Per-browser help for re-enabling a blocked microphone. */
function micHelp(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua))
    return "On iPhone: Settings → Safari → Microphone → Allow, then reload this page.";
  if (/Firefox/.test(ua))
    return "In Firefox: click the microphone icon in the address bar and remove the block, then try again.";
  if (/Safari/.test(ua) && !/Chrome/.test(ua))
    return "In Safari: Safari menu → Settings for This Website → Microphone → Allow.";
  return "Click the lock or microphone icon next to the address bar, set Microphone to Allow, then try again.";
}

/** Explains why we need the mic, then asks the browser. The stream is closed right away. */
export function MicPermissionStep({ step, onNext }: StepProps<"mic_permission">) {
  const markCompleted = useFunnelStore((s) => s.markCompleted);
  const [state, setState] = useState<MicState>("idle");
  const done = useRef(false);

  const ask = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      track("mic_permission_result", { result: "unsupported" });
      setState("unsupported");
      return;
    }
    setState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // just checking permission
      if (done.current) return;
      done.current = true;
      track("mic_permission_result", { result: "granted" });
      markCompleted(step.id);
      onNext();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      const result = name === "NotFoundError" ? "unsupported" : "denied";
      track("mic_permission_result", { result });
      setState(result);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Mascot mood="listening" size={104} className="-ml-2" />
      <StepHeading
        title="Next: a 45-second speaking check"
        subtitle="You’ll read a short paragraph out loud. We need your microphone to record it."
      />
      <Card className="flex flex-col gap-1.5 bg-lav text-on-pastel">
        <p className="flex items-center gap-2 font-bold">
          <Icon name="lock" className="size-[18px] text-brand" />
          Your recording is private
        </p>
        <p className="text-sm text-on-pastel-muted">
          It’s used only to analyze your speaking, and it’s deleted if you don’t create an account.
        </p>
      </Card>
      {state === "denied" && (
        <p role="alert" className="font-medium text-danger">
          Microphone access is blocked. {micHelp()}
        </p>
      )}
      {state === "unsupported" && (
        <p role="alert" className="font-medium text-danger">
          We couldn’t find a microphone, or this browser can’t record audio. Try a recent Chrome,
          Safari, Firefox or Edge.
        </p>
      )}
      <ContinueButton onClick={() => void ask()} disabled={state === "asking"}>
        {state === "asking"
          ? "Waiting for permission…"
          : state === "idle"
            ? "Allow microphone"
            : "Try again"}
      </ContinueButton>
    </div>
  );
}
