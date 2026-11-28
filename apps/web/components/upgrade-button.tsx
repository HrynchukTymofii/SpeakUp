"use client";

import { useAuth } from "@clerk/nextjs";
import { ErrorCode } from "@speakup/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InstallCard } from "@/components/pwa/install-card";
import { track } from "@/funnel/analytics";
import { ApiClientError } from "@/lib/api";
import { getPaddle, onPaddleEvent, paddleConfigured } from "@/lib/paddle";
import { useApi } from "@/lib/use-api";
import { useMe } from "@/lib/use-me";

type Phase = "idle" | "opening" | "activating" | "active" | "timeout" | "error";

/** How long we wait for Paddle's webhook to make the account Pro after payment. */
const ACTIVATION_TIMEOUT_MS = 60_000;

/**
 * "Upgrade to Pro" (SPEC §8): opens Paddle's overlay checkout with our user id as customData.
 *
 * After payment we do NOT unlock anything ourselves — Paddle's webhook is the source of truth.
 * We poll /v1/me until the API reports Pro (usually a few seconds), then refresh the app's data.
 *
 * Someone who already has Pro is never offered the upgrade: they get a way to the dashboard instead.
 *
 * Right after activation we offer to install the app (on /pricing and /app/billing). The funnel paywall
 * doesn't need that here: it moves on to the install screen itself in `onActivated`.
 */
export function UpgradeButton({
  placement,
  className = "",
  onActivated,
}: {
  placement: "pricing" | "funnel" | "lesson";
  className?: string;
  onActivated?: () => void;
}) {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  // The Paddle listener below is registered once; it reads the latest phase from here.
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const [message, setMessage] = useState<string | null>(null);
  const alreadyPro = useMe().data?.entitlements.plan === "pro";

  // While activating, poll the entitlements.
  const me = useQuery({
    queryKey: ["me", "activation"],
    queryFn: () => api.getMe(),
    enabled: phase === "activating",
    refetchInterval: 2_000,
  });
  const nowPro = me.data?.entitlements.plan === "pro";

  useEffect(() => {
    if (phase !== "activating") return;
    if (nowPro) {
      track("pro_activated", { placement });
      // Lessons, quotas and the profile all depend on the plan → refetch everything.
      void queryClient.invalidateQueries();
      queueMicrotask(() => {
        setPhase("active");
        onActivated?.();
      });
      return;
    }
    const timer = setTimeout(() => setPhase("timeout"), ACTIVATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, nowPro, queryClient, onActivated, placement]);

  // Paddle tells us when the payment went through.
  useEffect(
    () =>
      onPaddleEvent((event) => {
        if (event.name === "checkout.completed") {
          const totals = event.data?.totals;
          track(
            "checkout_completed",
            { placement },
            totals && { amount: totals.total, currency: event.data?.currency_code },
          );
          setPhase("activating");
        }
        if (event.name === "checkout.closed") {
          // Closed without paying (after paying, the phase is already "activating").
          if (phaseRef.current === "opening") track("checkout_closed", { placement });
          setPhase((p) => (p === "opening" ? "idle" : p));
        }
      }),
    [placement],
  );

  const start = async () => {
    setPhase("opening");
    setMessage(null);
    track("checkout_started", { placement });
    try {
      const [paddle, checkout] = await Promise.all([getPaddle(), api.startCheckout()]);
      if (!paddle) throw new Error("Paddle.js unavailable");
      paddle.Checkout.open({
        items: [{ priceId: checkout.priceId, quantity: 1 }],
        customData: checkout.customData,
        ...(checkout.customerEmail && { customer: { email: checkout.customerEmail } }),
        settings: { displayMode: "overlay", theme: "light" },
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === ErrorCode.WRONG_STATE) {
        // The account is already Pro (our cached plan was stale): reload it, which swaps this
        // button for the "already on Pro" state. Not an error from the user's point of view.
        setPhase("idle");
        void queryClient.invalidateQueries({ queryKey: ["me"] });
        return;
      }
      setPhase("error");
      setMessage("We couldn’t open the checkout. Please try again.");
    }
  };

  const base = `btn min-h-14 w-full px-5 text-base ${className}`;

  if (!isSignedIn) {
    return (
      <Link
        href={`/sign-up?redirect_url=${encodeURIComponent(pathname)}`}
        className={`${base} bg-peach text-center text-on-pastel shadow-peach hover:bg-peach-2`}
      >
        Create an account to upgrade
      </Link>
    );
  }

  if (!paddleConfigured()) {
    return (
      <p className="rounded-[20px] bg-lav p-4 text-sm font-medium text-on-pastel">
        Checkout isn’t configured (set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN).
      </p>
    );
  }

  if (phase === "active") {
    const status = (
      <p role="status" className="rounded-[20px] bg-sage p-4 font-bold text-on-pastel">
        You’re on SpeakUp Pro. Every lesson is unlocked.
      </p>
    );
    if (placement === "funnel") return status;
    return (
      <div className="flex flex-col gap-4">
        {status}
        <InstallCard placement="purchase" />
      </div>
    );
  }

  // While activating, the poll above decides; afterwards "active" shows the celebration instead.
  if (alreadyPro && phase !== "activating") {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] bg-sage p-4 text-on-pastel">
        <p role="status" className="font-bold">
          You’re already on SpeakUp Pro. Every lesson is unlocked.
        </p>
        <Link href="/app" className="btn btn-secondary">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={phase === "opening" || phase === "activating"}
        className={`${base} bg-peach text-on-pastel shadow-peach hover:bg-peach-2`}
      >
        {phase === "opening"
          ? "Opening checkout…"
          : phase === "activating"
            ? "Activating your Pro plan…"
            : "Upgrade to Pro"}
      </button>
      {phase === "timeout" && (
        <p role="status" className="text-sm text-muted">
          Payment received — activation is taking longer than usual. Refresh in a minute; your plan
          will appear automatically.
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
