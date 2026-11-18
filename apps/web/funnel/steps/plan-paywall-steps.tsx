"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProPrice } from "@/components/pro-price";
import { UpgradeButton } from "@/components/upgrade-button";
import { track } from "../analytics";
import { PRO_FEATURES } from "../plans";
import { buildPlan } from "../personalize";
import { useFunnelStore } from "../store";
import { Card, ContinueButton, StepHeading } from "../ui";
import type { StepProps } from "./props";

/** "Your 4-week plan" (SPEC §15.2 step 17): derived from goal, focus and time; no promised outcomes. */
export function PlanStep({ step, ctx, onNext }: StepProps<"plan_summary">) {
  const { baselineScore, markCompleted } = useFunnelStore();
  const plan = buildPlan(ctx.answers);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <StepHeading title={plan.headline} subtitle={`${plan.minutesPerDay} minutes a day`} />
      {baselineScore !== null && baselineScore > 0 && (
        <Card className="flex items-center justify-between bg-slate-50">
          <span className="text-slate-600">Your starting point</span>
          <span className="text-xl font-semibold tabular-nums">{baselineScore}/100</span>
        </Card>
      )}
      <ol className="flex flex-col gap-3">
        {plan.weeks.map((week) => (
          <li key={week.week}>
            <Card className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Week {week.week}
              </p>
              <p className="font-semibold">{week.title}</p>
              <p className="text-sm text-slate-600">{week.detail}</p>
            </Card>
          </li>
        ))}
      </ol>
      <ContinueButton
        onClick={() => {
          markCompleted(step.id);
          onNext();
        }}
      >
        Start my plan
      </ContinueButton>
    </div>
  );
}

/**
 * Paywall (SPEC §15.2 step 18), laid out like the reference: plan recap, what's included, the Pro
 * plan with Paddle's localized price, ONE primary button, "cancel anytime", and a visible free
 * option. No countdowns, no fake discounts. The visitor is signed in here (after the auth step),
 * so the checkout is tied to their account.
 */
export function PaywallStep({ ctx }: StepProps<"paywall">) {
  const router = useRouter();
  const plan = buildPlan(ctx.answers);

  useEffect(() => track("paywall_viewed", { placement: "funnel" }), []);

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      <StepHeading
        title={`${plan.headline} is ready`}
        subtitle="Unlock every lesson and keep practicing daily."
      />

      <ul className="flex flex-col gap-2">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="text-emerald-600">
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>

      <Card className="flex items-center justify-between border-2 border-slate-900">
        <span className="flex flex-col">
          <span className="font-semibold">SpeakUp Pro</span>
          <span className="text-sm text-slate-500">Billed monthly</span>
        </span>
        <span className="text-right font-semibold">
          <ProPrice fallback="…" />
          <span className="text-sm font-normal text-slate-500">/month</span>
        </span>
      </Card>

      <UpgradeButton placement="funnel" onActivated={() => router.push("/app")} />
      <p className="-mt-3 text-center text-xs text-slate-500">
        Renews automatically. Cancel anytime.
      </p>

      <button
        type="button"
        onClick={() => router.push("/app")}
        className="py-2 text-sm font-medium text-slate-600 underline-offset-4 hover:underline"
      >
        Continue with the free plan
      </button>

      <details className="rounded-xl border border-slate-200 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Can I cancel anytime?</summary>
        <p className="mt-2 text-slate-600">
          Yes — from Billing in your account. You keep Pro until the end of the period you paid for.
        </p>
      </details>
      <details className="rounded-xl border border-slate-200 p-4 text-sm">
        <summary className="cursor-pointer font-medium">What happens to my recordings?</summary>
        <p className="mt-2 text-slate-600">
          They’re private and used only to analyze your speaking. Recordings from people who don’t
          create an account are deleted after 7 days.
        </p>
      </details>
    </div>
  );
}
