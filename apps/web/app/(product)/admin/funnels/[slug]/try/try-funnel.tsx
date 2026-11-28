"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { Mascot } from "@/components/mascot";
import { useFunnelStore } from "@/funnel/store";
import { ApiClientError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { FunnelProviderClient } from "../../../../start/funnel-client";

/**
 * A test run: the real funnel, step by step, so an admin can check everything works before
 * launch: recording, analysis, sign-up and paywall included. It uses the saved draft when there
 * is one (else what visitors see), so a draft funnel or unpublished changes can be tried too.
 *
 * What runs is real: the recording is analyzed, sign-up attaches the check to the admin's
 * account, checkout charges. Events carry `test_run: true`. A session for a draft funnel isn't
 * linked to it, so it doesn't count in its numbers; a live funnel's test sessions do count.
 */
export function TryFunnel({ slug, children }: { slug: string; children: ReactNode }) {
  const api = useApi();
  const router = useRouter();
  const detail = useQuery({
    queryKey: ["admin-funnel", slug],
    queryFn: () => api.getAdminFunnel(slug),
    // Steps move with every answer; refetching mid-run would only re-render the funnel.
    refetchOnWindowFocus: false,
    retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 1,
  });

  if (detail.isPending) return <p className="px-4 pt-8 text-muted">Loading…</p>;
  if (detail.isError) {
    const status = detail.error instanceof ApiClientError ? detail.error.status : 0;
    return (
      <div className="flex flex-col items-center gap-5 px-4 pt-10 text-center">
        <Mascot mood="thinking" size={96} />
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
          {status === 403
            ? "This page is for admins"
            : status === 404
              ? "There’s no funnel at this link"
              : "Couldn’t load the funnel"}
        </h1>
        <BackLink href="/admin/funnels">All funnels</BackLink>
      </div>
    );
  }

  const { funnel, draft, definition } = detail.data;
  const basePath = `/admin/funnels/${slug}/try`;
  const startOver = () => {
    // A fresh visitor: no answers, recording or claim from an earlier run of this funnel.
    const store = useFunnelStore.getState();
    store.reset();
    store.enterFunnel(slug, funnel.version);
    router.replace(basePath);
  };

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-md flex-col px-4 pt-3">
      <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-card-2 p-3 text-sm">
        <p>
          <span className="font-bold">Test run of {funnel.name}</span>
          {draft ? " with the unpublished changes" : ""}. Recording, sign-up and checkout are real;
          pick the free plan at the end.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm min-h-11 btn-secondary" onClick={startOver}>
            Start over
          </button>
          <Link href={`/admin/funnels/${slug}`} className="btn btn-sm min-h-11 btn-secondary">
            Back to the editor
          </Link>
        </div>
      </div>
      <FunnelProviderClient
        slug={slug}
        version={funnel.version}
        definition={draft ?? definition}
        basePath={basePath}
        testRun
      >
        {children}
      </FunnelProviderClient>
    </main>
  );
}
