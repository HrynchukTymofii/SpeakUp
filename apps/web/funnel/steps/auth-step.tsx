"use client";

import { SignUp, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Mascot } from "@/components/mascot";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { track } from "../analytics";
import { funnelApi } from "../api";
import { useFunnel } from "../funnel-context";
import { useIsFunnelPreview } from "../preview";
import { useFunnelStore } from "../store";
import { StepHeading } from "../ui";
import type { StepProps } from "./props";

const STAGE_TEXT: Record<string, string> = {
  awaiting_upload: "Waiting for your recording…",
  queued: "Your recording is in the queue…",
  transcribing: "Transcribing your recording…",
  analyzing: "Measuring pace, pauses and filler words…",
  completed: "Your analysis is ready",
  failed: "We couldn’t analyze this recording — you’ll see why after signing up.",
};

/**
 * Auth gate (SPEC §15.2 step 12): sign up to see the results. The analysis runs meanwhile, and a
 * small live status line shows its progress. Once signed in (new or existing account), we claim
 * the anonymous session → the attempt now belongs to the account → results.
 * Already signed-in visitors skip the form: the claim runs straight away.
 */
export function AuthStep({ step, onNext }: StepProps<"auth_gate">) {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  // Clerk sends the visitor back to this step of the same funnel, where the claim runs.
  const returnUrl = `${useFunnel().basePath}/${step.id}`;
  const { guestToken, attemptId, claimed, setClaimed } = useFunnelStore();
  // The admin is signed in: without this, the preview would claim their own funnel session.
  const preview = useIsFunnelPreview();

  const status = useQuery({
    queryKey: ["funnel-status", attemptId],
    queryFn: () => funnelApi.getAttemptStatus(guestToken ?? "", attemptId ?? ""),
    enabled: !preview && guestToken !== null && attemptId !== null && !isSignedIn,
    refetchInterval: (q) => {
      const stage = q.state.data?.attempt.stage;
      return stage === "completed" || stage === "failed" ? false : 2_000;
    },
  });

  const claim = useMutation({
    mutationFn: () => api.claimFunnel(guestToken ?? ""),
    onSuccess: () => {
      setClaimed();
      track("funnel_signup_completed", { step: step.id });
      onNext();
    },
  });

  // Signed in (just now, or already) → claim once.
  const { mutate, isIdle } = claim;
  useEffect(() => {
    if (!preview && isLoaded && isSignedIn && guestToken && !claimed && isIdle) mutate();
  }, [preview, isLoaded, isSignedIn, guestToken, claimed, isIdle, mutate]);

  if (preview) return <SignUpScreen stage="analyzing" form={<SignUpFormSample />} />;

  if (!isLoaded) return <p className="text-muted">Loading…</p>;

  if (isSignedIn) {
    if (claim.isError) {
      const otherAccount =
        claim.error instanceof ApiClientError && claim.error.code === "WRONG_STATE";
      return (
        <div className="flex flex-col gap-4">
          <StepHeading
            title={otherAccount ? "This check belongs to another account" : "Something went wrong"}
            subtitle={
              otherAccount
                ? "Sign in with the account you created during this check, or take a new check from your dashboard."
                : "We couldn’t attach your speaking check to your account."
            }
          />
          {!otherAccount && (
            <button type="button" onClick={() => claim.reset()} className="btn btn-primary w-fit">
              Try again
            </button>
          )}
          <Link href="/app" className="link text-sm font-bold underline">
            Go to the dashboard
          </Link>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-muted">
        <Mascot mood="thinking" size={96} />
        Preparing your results…
      </div>
    );
  }

  return (
    <SignUpScreen
      stage={status.data?.attempt.stage}
      form={
        // routing="hash": the whole sign-up (incl. email code) happens inside this page.
        <SignUp
          routing="hash"
          forceRedirectUrl={returnUrl}
          signInForceRedirectUrl={returnUrl}
          signInUrl={`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`}
        />
      }
    />
  );
}

/** The signed-out screen: analysis status, and the sign-up form below it. */
function SignUpScreen({ stage, form }: { stage: string | undefined; form: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <Mascot mood={stage === "completed" ? "happy" : "thinking"} size={96} className="-ml-2" />
      <StepHeading
        title="Your analysis is being prepared"
        subtitle="Create a free account to see your results."
      />
      <p
        aria-live="polite"
        className="flex w-fit items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-sm font-semibold text-muted"
      >
        <span
          aria-hidden
          className={`size-2 rounded-full ${stage === "completed" ? "bg-sage" : "animate-pulse bg-butter"}`}
        />
        {STAGE_TEXT[stage ?? "queued"]}
      </p>
      <div className="flex justify-center">{form}</div>
    </div>
  );
}

/**
 * Stands in for Clerk's form in the editor preview (the real one would act on the admin's own
 * session). It follows the layout Clerk shows, not its exact styling.
 */
function SignUpFormSample() {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-4 rounded-2xl border border-line bg-card p-6 shadow-soft">
      <div className="text-center">
        <p className="font-bold">Create your account</p>
        <p className="text-sm text-muted">Welcome! Please fill in the details to get started.</p>
      </div>
      <span className="rounded-lg border border-line px-3 py-2 text-center text-sm font-semibold">
        Continue with Google
      </span>
      <p className="text-center text-xs text-muted">or</p>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Email address</span>
        <span className="h-9 rounded-lg border border-line" />
      </div>
      <span className="rounded-lg bg-ink py-2 text-center text-sm font-semibold text-page">
        Continue
      </span>
      <p className="text-center text-xs text-muted">Sample of the sign-up form</p>
    </div>
  );
}
