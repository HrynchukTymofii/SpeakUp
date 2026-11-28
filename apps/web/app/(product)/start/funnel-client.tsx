"use client";

import {
  DEFAULT_FUNNEL_DEFINITION,
  DEFAULT_FUNNEL_REVISION,
  DEFAULT_FUNNEL_SLUG,
} from "@speakup/shared";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The funnel lives on browser storage (resume after reload), so it renders in the browser only —
// same approach as the reference funnel. No server HTML means no hydration mismatch with
// localStorage-based state. The provider is client-only too: it writes that storage on mount.
const loading = () => <div className="flex-1" aria-busy />;

export const FunnelProviderClient = dynamic(
  () => import("@/funnel/funnel-context").then((m) => m.FunnelProvider),
  { ssr: false, loading },
);

export const FunnelStepClient = dynamic(
  () => import("@/funnel/funnel-shell").then((m) => m.FunnelShell),
  { ssr: false, loading },
);

export const FunnelResumeClient = dynamic(
  () => import("@/funnel/funnel-shell").then((m) => m.FunnelResume),
  { ssr: false, loading },
);

/**
 * `/start` renders the bundled default funnel (`main`) and never calls the API, so the ad landing
 * flow keeps working when the API is down. It shares the visitor's saved progress with `/f/main`.
 */
export function DefaultFunnel({ children }: { children: ReactNode }) {
  return (
    <FunnelProviderClient
      slug={DEFAULT_FUNNEL_SLUG}
      version={DEFAULT_FUNNEL_REVISION}
      definition={DEFAULT_FUNNEL_DEFINITION}
      basePath="/start"
    >
      {children}
    </FunnelProviderClient>
  );
}
