"use client";

import { SignUp, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { Mascot } from "@/components/mascot";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { track } from "../analytics";
import { funnelApi } from "../api";
import { useFunnel } from "../funnel-context";
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

  const status = useQuery({
    queryKey: ["funnel-status", attemptId],
    queryFn: () => funnelApi.getAttemptStatus(guestToken ?? "", attemptId ?? ""),
    enabled: guestToken !== null && attemptId !== null && !isSignedIn,
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
    if (isLoaded && isSignedIn && guestToken && !claimed && isIdle) mutate();
  }, [isLoaded, isSignedIn, guestToken, claimed, isIdle, mutate]);

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

  const stage = status.data?.attempt.stage;
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
      <div className="flex justify-center">
        {/* routing="hash": the whole sign-up (incl. email code) happens inside this page. */}
        <SignUp
          routing="hash"
          forceRedirectUrl={returnUrl}
          signInForceRedirectUrl={returnUrl}
          signInUrl={`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`}
        />
      </div>
    </div>
  );
}
