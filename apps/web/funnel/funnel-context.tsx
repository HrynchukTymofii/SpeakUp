"use client";

import type { FunnelDefinition } from "@speakup/shared";
import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { publicEnv } from "@/lib/env";
import { setEventContext } from "./analytics";
import { readAttribution } from "./attribution";
import { FunnelPreviewContext } from "./preview";
import { useFunnelStore } from "./store";
import type { FunnelStep } from "./types";

/** The funnel a page renders: which one (for the session and analytics), its steps and its URLs. */
export interface FunnelContextValue {
  slug: string;
  /** Content revision shown (`Funnel.version`), not the definition's schema format. */
  version: number;
  steps: FunnelStep[];
  /** Step URLs are `${basePath}/<stepId>`: "/start" or "/f/<slug>". */
  basePath: string;
  /** An admin's test run: the guest session isn't linked to the funnel or attributed. */
  testRun: boolean;
}

/**
 * Which funnel the visitor store holds. A test run has its own key, so it never resumes a real
 * visit of the same funnel in this browser, and a real visit never resumes a test run.
 */
export const funnelStoreKey = (slug: string, testRun: boolean) => (testRun ? `test:${slug}` : slug);

const FunnelContext = createContext<FunnelContextValue | null>(null);

/** Hosts whose referrer is navigation inside SpeakUp, not a traffic source. */
function ownHosts(): string[] {
  const configured = [publicEnv.NEXT_PUBLIC_SITE_URL, publicEnv.NEXT_PUBLIC_APP_URL]
    .filter((url): url is string => Boolean(url))
    .map((url) => new URL(url).hostname);
  return [window.location.hostname, ...configured];
}

/**
 * Makes one funnel definition available to the shell and the steps. Before any step mounts it
 * points the persisted store at this funnel (a different funnel starts fresh), records first-touch
 * attribution from the landing URL, and tags analytics events with the funnel. Children render
 * only after that, so the guest session is created for this funnel with its attribution.
 */
export function FunnelProvider({
  slug,
  version,
  definition,
  basePath,
  testRun = false,
  children,
}: {
  slug: string;
  version: number;
  definition: FunnelDefinition;
  basePath: string;
  /** An admin's test run (`/admin/funnels/<slug>/try`): events carry `test_run: true`. */
  testRun?: boolean;
  children: ReactNode;
}) {
  // Steps render only once the store belongs to this funnel, never with another funnel's state.
  const storeKey = funnelStoreKey(slug, testRun);
  const entered = useFunnelStore((s) => s.funnelSlug === storeKey);

  // Layout effect: runs before the children's effects (guest session, step redirects) and before
  // paint. Attribution comes after enterFunnel, which clears it when the funnel changes (a new
  // funnel is a new session with its own first touch). React re-renders with the entered store
  // only after this whole effect, so the steps never see a half-entered funnel.
  useLayoutEffect(() => {
    const store = useFunnelStore.getState();
    store.enterFunnel(storeKey, version);
    // An admin's test run isn't traffic: no UTM / referrer to record.
    if (!testRun) {
      store.captureAttribution(
        readAttribution(window.location.search, document.referrer, ownHosts()),
      );
    }
    setEventContext({
      funnel_id: slug,
      funnel_version: version,
      // Lets the Amplitude charts leave out admins trying a funnel before launch.
      ...(testRun ? { test_run: true } : {}),
    });
    return () => setEventContext(null);
  }, [slug, version, testRun, storeKey]);

  const value = { slug, version, steps: definition.steps, basePath, testRun };
  return (
    <FunnelContext.Provider value={value}>
      {entered ? children : <div className="flex-1" aria-busy />}
    </FunnelContext.Provider>
  );
}

/**
 * The funnel editor's preview: the same context the steps read, without FunnelProvider's side
 * effects (entering the visitor store, attribution, analytics context). Also turns on
 * FunnelPreviewContext, so steps use sample data and act on nothing.
 */
export function FunnelPreviewScope({
  slug,
  steps,
  children,
}: {
  slug: string;
  steps: FunnelStep[];
  children: ReactNode;
}) {
  const value = { slug, version: 0, steps, basePath: `/f/${slug}`, testRun: false };
  return (
    <FunnelContext.Provider value={value}>
      <FunnelPreviewContext.Provider value>{children}</FunnelPreviewContext.Provider>
    </FunnelContext.Provider>
  );
}

export function useFunnel(): FunnelContextValue {
  const value = useContext(FunnelContext);
  if (!value) throw new Error("useFunnel() must be used inside a FunnelProvider");
  return value;
}
