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
    return <p className="text-muted">Loading your profile…</p>;
  }

  if (me.isError) {
    const err = me.error;
    return (
      <div role="alert" className="rounded-3xl bg-rose p-5 text-on-pastel">
        <p className="font-bold">Couldn’t load your profile.</p>
        <p className="text-sm">
          {err instanceof ApiClientError ? `${err.code}: ${err.message}` : err.message}
        </p>
      </div>
    );
  }

  const { user, entitlements, usage } = me.data;
  return (
    <section className="card">
      <h2 className="mb-4 font-display text-xl font-semibold">Your profile (from the API)</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted">Email</dt>
        <dd>{user.email ?? "—"}</dd>
        <dt className="text-muted">Plan</dt>
        <dd className="flex items-center gap-3">
          <span className="pill bg-peach text-on-pastel capitalize">{entitlements.plan}</span>
          <Link
            href={entitlements.plan === "pro" ? "/app/billing" : "/pricing"}
            className="font-bold text-peach underline-offset-4 hover:underline"
          >
            {entitlements.plan === "pro" ? "Billing" : "Upgrade"}
          </Link>
        </dd>
        <dt className="text-muted">Analyses today</dt>
        <dd>
          {usage.analysesToday} / {entitlements.dailyAnalysesLimit}
        </dd>
        <dt className="text-muted">Member since</dt>
        <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
        <dt className="text-muted">Onboarding</dt>
        <dd>
          {user.onboarding ? `${Object.keys(user.onboarding).length} answers` : "Not done yet"}
        </dd>
      </dl>
    </section>
  );
}
