"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProPrice } from "@/components/pro-price";
import { UpgradeButton } from "@/components/upgrade-button";
import { installHref } from "@/lib/pwa/install-href";
import { useMe } from "@/lib/use-me";
import { track } from "../analytics";
import { PRO_FEATURES } from "../plans";
import { buildPlan } from "../personalize";
import { useIsFunnelPreview } from "../preview";
import { PREVIEW_SCORE } from "../preview-samples";
import { useFunnelStore } from "../store";
import { Card, ContinueButton, StepHeading, Tick } from "../ui";
import type { StepProps } from "./props";
import { CheckoutTerms } from "@/components/checkout-terms";

/** Week badges: the first week in ink (where you start), the rest on the lavender wash (Glow). */
const WEEK_COLORS = ["bg-ink text-page", "bg-lav text-on-pastel"];

/** "Your 4-week plan" (SPEC §15.2 step 17): derived from goal, focus and time; no promised outcomes. */
export function PlanStep({ step, ctx, onNext }: StepProps<"plan_summary">) {
  const store = useFunnelStore();
  const { markCompleted } = store;
  const baselineScore = useIsFunnelPreview() ? PREVIEW_SCORE : store.baselineScore;
  const plan = buildPlan(ctx.answers);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <StepHeading title={plan.headline} subtitle={`${plan.minutesPerDay} minutes a day`} />
      {baselineScore !== null && baselineScore > 0 && (
        <Card className="surface-glow flex items-center justify-between">
          <span className="font-semibold text-on-pastel-muted">Your starting point</span>
          <span className="font-display text-2xl font-semibold tabular-nums">
            {baselineScore}/100
          </span>
        </Card>
      )}
      <ol className="flex flex-col gap-3">
        {plan.weeks.map((week, i) => (
          <li key={week.week}>
            <Card className="flex gap-4">
              <span
                className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl font-display leading-none font-semibold ${i === 0 ? WEEK_COLORS[0] : WEEK_COLORS[1]}`}
              >
                <span className="text-[9px] font-extrabold tracking-wider uppercase">Wk</span>
                <span className="text-lg">{week.week}</span>
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-bold">{week.title}</span>
                <span className="text-sm leading-relaxed text-muted">{week.detail}</span>
              </span>
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
 *
 * Both exits — the free plan and a completed upgrade — go through the install screen on their way
 * to the app: the end of the funnel is when someone is most likely to keep SpeakUp on their home
 * screen. `/install` skips itself when the app is already installed.
 */
export function PaywallStep({ ctx }: StepProps<"paywall">) {
  const router = useRouter();
  const plan = buildPlan(ctx.answers);
  // Someone who already has Pro gets the dashboard link from UpgradeButton, not a "free plan" exit.
  const alreadyPro = useMe().data?.entitlements.plan === "pro";

  const preview = useIsFunnelPreview();
  useEffect(() => {
    if (!preview) track("paywall_viewed", { placement: "funnel" });
  }, [preview]);

  return (
    <div className="flex flex-1 flex-col gap-5 pb-6">
      <StepHeading
        title={`${plan.headline} is ready`}
        subtitle="Unlock every lesson and keep practicing daily."
      />

      <ul className="flex flex-col gap-3">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex gap-3 font-medium">
            <Tick />
            {f}
          </li>
        ))}
      </ul>

      <Card className="flex items-center justify-between border-0 bg-ink text-page">
        <span className="flex flex-col">
          <span className="font-display text-lg font-semibold">SpeakUp Pro</span>
          <span className="text-sm font-medium text-page/60">Billed monthly</span>
        </span>
        <span className="text-right font-display text-2xl font-semibold">
          <ProPrice fallback="…" />
          <span className="font-sans text-sm font-medium text-page/60">/month</span>
        </span>
      </Card>

      <UpgradeButton placement="funnel" onActivated={() => router.push(installHref("purchase"))} />
      <div className="-mt-3 flex flex-col gap-1">
        <p className="text-center text-xs text-muted">Renews automatically. Cancel anytime.</p>
        <CheckoutTerms />
      </div>

      {!alreadyPro && (
        <button
          type="button"
          onClick={() => {
            track("funnel_free_plan_chosen");
            router.push(installHref("funnel"));
          }}
          className="py-2 text-sm font-bold text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Continue with the free plan
        </button>
      )}

      <details className="rounded-[20px] border border-line bg-card p-4 text-sm">
        <summary className="cursor-pointer font-bold">Can I cancel anytime?</summary>
        <p className="mt-2 leading-relaxed text-muted">
          Yes — from Billing in your account. You keep Pro until the end of the period you paid for.
        </p>
      </details>
      <details className="rounded-[20px] border border-line bg-card p-4 text-sm">
        <summary className="cursor-pointer font-bold">What happens to my recordings?</summary>
        <p className="mt-2 leading-relaxed text-muted">
          They’re private and used only to analyze your speaking. Recordings from people who don’t
          create an account are deleted after 7 days.
        </p>
      </details>
    </div>
  );
}
