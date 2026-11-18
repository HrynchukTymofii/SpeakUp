"use client";

import { useAuth } from "@clerk/nextjs";
import { ErrorCode } from "@speakup/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/funnel/analytics";
import { ApiClientError } from "@/lib/api";
import { getPaddle, onPaddleEvent, paddleConfigured } from "@/lib/paddle";
import { useApi } from "@/lib/use-api";

type Phase = "idle" | "opening" | "activating" | "active" | "timeout" | "error";

/** How long we wait for Paddle's webhook to make the account Pro after payment. */
const ACTIVATION_TIMEOUT_MS = 60_000;

/**
 * "Upgrade to Pro" (SPEC §8): opens Paddle's overlay checkout with our user id as customData.
 *
 * After payment we do NOT unlock anything ourselves — Paddle's webhook is the source of truth.
 * We poll /v1/me until the API reports Pro (usually a few seconds), then refresh the app's data.
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
  const [message, setMessage] = useState<string | null>(null);

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
  }, [phase, nowPro, queryClient, onActivated]);

  // Paddle tells us when the payment went through.
  useEffect(
    () =>
      onPaddleEvent((event) => {
        if (event.name === "checkout.completed") setPhase("activating");
        if (event.name === "checkout.closed") setPhase((p) => (p === "opening" ? "idle" : p));
      }),
    [],
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
        settings: { displayMode: "overlay", theme: "dark" },
      });
    } catch (err) {
      setPhase("error");
      setMessage(
        err instanceof ApiClientError && err.code === ErrorCode.WRONG_STATE
          ? "You already have SpeakUp Pro."
          : "We couldn’t open the checkout. Please try again.",
      );
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
      <p className="rounded-[20px] bg-butter p-4 text-sm font-medium text-on-pastel">
        Checkout isn’t configured (set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN).
      </p>
    );
  }

  if (phase === "active") {
    return (
      <p role="status" className="rounded-[20px] bg-sage p-4 font-bold text-on-pastel">
        You’re on SpeakUp Pro 🎉 Every lesson is unlocked.
      </p>
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
