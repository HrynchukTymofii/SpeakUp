"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

/** Fetches GET /v1/me from apps/api with the Clerk token and renders it. */
export function ProfileCard() {
  const api = useApi();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.getMe() });

  if (me.isPending) {
    return <p className="text-slate-500">Loading your profile…</p>;
  }

  if (me.isError) {
    const err = me.error;
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Couldn’t load your profile.</p>
        <p className="text-sm">
          {err instanceof ApiClientError ? `${err.code}: ${err.message}` : err.message}
        </p>
      </div>
    );
  }

  const { user, entitlements, usage } = me.data;
  return (
    <section className="rounded-lg border border-slate-200 p-4">
      <h2 className="mb-3 font-medium">Your profile (from the API)</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-slate-500">Email</dt>
        <dd>{user.email ?? "—"}</dd>
        <dt className="text-slate-500">Plan</dt>
        <dd className="flex gap-3">
          <span className="capitalize">{entitlements.plan}</span>
          <Link
            href={entitlements.plan === "pro" ? "/app/billing" : "/pricing"}
            className="text-slate-600 underline"
          >
            {entitlements.plan === "pro" ? "Billing" : "Upgrade"}
          </Link>
        </dd>
        <dt className="text-slate-500">Analyses today</dt>
        <dd>
          {usage.analysesToday} / {entitlements.dailyAnalysesLimit}
        </dd>
        <dt className="text-slate-500">Member since</dt>
        <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
        <dt className="text-slate-500">Onboarding</dt>
        <dd>
          {user.onboarding ? `${Object.keys(user.onboarding).length} answers` : "Not done yet"}
        </dd>
      </dl>
    </section>
  );
}
