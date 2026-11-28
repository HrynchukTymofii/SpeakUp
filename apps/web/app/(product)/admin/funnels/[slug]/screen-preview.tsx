"use client";

import type { FunnelStepDef } from "@speakup/shared";
import type { ComponentType } from "react";
import { Mascot } from "@/components/mascot";
import { FunnelPreviewContext } from "@/funnel/preview";
import { STEP_COMPONENTS } from "@/funnel/steps";
import type { StepProps } from "@/funnel/steps/props";
import { SCREEN_KINDS, screenName } from "./screens";

/**
 * Screens that render here exactly as visitors see them. They only act when tapped, and the
 * preview can't be tapped (`inert`), so nothing is saved or tracked.
 */
const LIVE_PREVIEW = new Set<FunnelStepDef["type"]>([
  "single_choice",
  "multi_choice",
  "slider",
  "reflection",
  "video_lesson",
  "mic_permission",
  "plan_summary",
]);

/**
 * The other screens act on their own as soon as they open (load the exercise, record, sign up,
 * fetch results, tick through the loader, open checkout), so they get a description instead.
 */
const ABOUT: Partial<Record<FunnelStepDef["type"], string>> = {
  recording:
    "Visitors read a short text out loud and the recording is analyzed. It uses the microphone, so it isn’t shown here.",
  auth_gate: "Visitors create an account to see their results. It’s the Clerk sign-up form.",
  results: "Shows the visitor’s speaking score and top issues from their recording.",
  loader_with_questions: "An animated “building your plan” screen that pauses to ask:",
  paywall: "The Pro plan with checkout, and a visible option to continue for free.",
};

const noop = () => {};

/** One screen in a phone-size frame. Personalized wording shows its no-answers fallback. */
export function ScreenPreview({ step }: { step: FunnelStepDef }) {
  return (
    <div className="mx-auto flex h-[640px] w-full max-w-[375px] flex-col overflow-y-auto rounded-[32px] border-8 border-ink bg-page px-4 pt-5 pb-6">
      {LIVE_PREVIEW.has(step.type) ? (
        <FunnelPreviewContext.Provider value>
          <div inert className="flex flex-1 flex-col" data-testid="live-preview">
            <LiveScreen step={step} />
          </div>
        </FunnelPreviewContext.Provider>
      ) : (
        <AboutScreen step={step} />
      )}
    </div>
  );
}

function LiveScreen({ step }: { step: FunnelStepDef }) {
  // Same widening as FunnelShell's StepView: the map pairs each type with its component.
  const Component = STEP_COMPONENTS[step.type] as ComponentType<StepProps<typeof step.type>>;
  return <Component step={step as never} ctx={{ answers: {}, topIssues: [] }} onNext={noop} />;
}

function AboutScreen({ step }: { step: FunnelStepDef }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Mascot mood="thinking" size={88} />
      <p className="pill bg-card-2 text-on-pastel">{SCREEN_KINDS[step.type]}</p>
      <h3 className="font-display text-2xl leading-tight font-semibold text-balance">
        {screenName(step)}
      </h3>
      <p className="text-muted">{ABOUT[step.type]}</p>
      {step.type === "loader_with_questions" && (
        <ul className="flex flex-col gap-1 text-sm font-medium">
          {step.questions.map((q) => (
            <li key={q.answerKey}>{q.title}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">Shown live only, not in this preview.</p>
    </div>
  );
}
