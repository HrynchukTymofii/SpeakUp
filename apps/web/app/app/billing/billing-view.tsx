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
    <Link href="/app" className="text-sm text-slate-600 hover:underline">
      ← Back to dashboard
    </Link>
  );
  if (me.isPending) return <p className="text-slate-500">Loading…</p>;
  if (me.isError) {
    return (
      <p role="alert" className="text-red-700">
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
      <h1 className="text-2xl font-semibold">Billing</h1>
      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Plan</dt>
          <dd className="font-medium">{isPro ? "SpeakUp Pro" : "Free"}</dd>
          {subscription && (
            <>
              <dt className="text-slate-500">Status</dt>
              <dd>{STATUS_TEXT[subscription.status] ?? subscription.status}</dd>
            </>
          )}
          {periodEnd && (
            <>
              <dt className="text-slate-500">
                {subscription?.status === "canceled" ? "Access until" : "Current period ends"}
              </dt>
              <dd>{periodEnd}</dd>
            </>
          )}
          <dt className="text-slate-500">Analyses today</dt>
          <dd>
            {usage.analysesToday} / {entitlements.dailyAnalysesLimit}
          </dd>
        </dl>
        {subscription?.manageable && (
          <button
            type="button"
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
            className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {portal.isPending ? "Opening…" : "Manage subscription"}
          </button>
        )}
        {portal.isError && (
          <p role="alert" className="text-sm text-red-700">
            Couldn’t open the subscription portal. Please try again.
          </p>
        )}
      </section>
      {!isPro && (
        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <h2 className="font-medium">Upgrade to Pro</h2>
          <p className="text-sm text-slate-600">
            Every lesson and up to 50 analyses a day.{" "}
            <Link href="/pricing" className="underline">
              See pricing
            </Link>
          </p>
          <UpgradeButton placement="pricing" />
        </section>
      )}
    </>
  );
}
