"use client";

import dynamic from "next/dynamic";

// The funnel lives on browser storage (resume after reload), so it renders in the browser only —
// same approach as the reference funnel. No server HTML means no hydration mismatch with
// localStorage-based state.
const loading = () => <div className="flex-1" aria-busy />;

export const FunnelStepClient = dynamic(
  () => import("@/funnel/funnel-shell").then((m) => m.FunnelShell),
  { ssr: false, loading },
);

export const FunnelResumeClient = dynamic(
  () => import("@/funnel/funnel-shell").then((m) => m.FunnelResume),
  { ssr: false, loading },
);
