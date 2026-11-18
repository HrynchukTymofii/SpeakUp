"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { UpgradeButton } from "@/components/upgrade-button";
import { useApi } from "@/lib/use-api";

const STATUS_TEXT: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment problem — please update your card",
  canceled: "Canceled",
};

/** Plan status + "Manage subscription" via Paddle's customer portal (SPEC §11 /app/billing). */
export function BillingView() {
  const api = useApi();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.getMe() });
  const portal = useMutation({
    mutationFn: () => api.openPortal(),
    // The portal link is short-lived and single-purpose: open it right away.
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const back = (
    <Link href="/app" className="link w-fit text-sm font-bold">
      ← Back to dashboard
    </Link>
  );
  if (me.isPending) return <p className="text-muted">Loading…</p>;
  if (me.isError) {
    return (
      <p role="alert" className="font-medium text-danger">
        Couldn’t load your plan.
      </p>
    );
  }

  const { entitlements, subscription, usage } = me.data;
  const isPro = entitlements.plan === "pro";
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <>
      {back}
      <h1 className="font-display text-[40px] leading-none font-semibold tracking-tight">
        Billing
      </h1>
      <section className="card flex flex-col gap-4">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted">Plan</dt>
          <dd>
            <span className={`pill ${isPro ? "bg-peach text-on-pastel" : "bg-card-2 text-ink"}`}>
              {isPro ? "SpeakUp Pro" : "Free"}
            </span>
          </dd>
          {subscription && (
            <>
              <dt className="text-muted">Status</dt>
              <dd>{STATUS_TEXT[subscription.status] ?? subscription.status}</dd>
            </>
          )}
          {periodEnd && (
            <>
              <dt className="text-muted">
                {subscription?.status === "canceled" ? "Access until" : "Current period ends"}
              </dt>
              <dd>{periodEnd}</dd>
            </>
          )}
          <dt className="text-muted">Analyses today</dt>
          <dd>
            {usage.analysesToday} / {entitlements.dailyAnalysesLimit}
          </dd>
        </dl>
        {subscription?.manageable && (
          <button
            type="button"
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
            className="btn btn-secondary btn-sm w-fit"
          >
            {portal.isPending ? "Opening…" : "Manage subscription"}
          </button>
        )}
        {portal.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            Couldn’t open the subscription portal. Please try again.
          </p>
        )}
      </section>
      {!isPro && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Upgrade to Pro</h2>
          <p className="text-sm text-muted">
            Every lesson and up to 50 analyses a day.{" "}
            <Link
              href="/pricing"
              className="font-bold text-peach underline-offset-4 hover:underline"
            >
              See pricing
            </Link>
          </p>
          <UpgradeButton placement="pricing" />
        </section>
      )}
    </>
  );
}
