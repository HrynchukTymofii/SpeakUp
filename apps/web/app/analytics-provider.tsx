"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { identifyUser, initAnalytics, setUserProperties } from "@/funnel/analytics";
import { publicEnv } from "@/lib/env";
import { useMe } from "@/lib/use-me";

/**
 * Starts Amplitude on every page and keeps its user in step with Clerk: the account id after
 * sign-in (also on the landing host, the cookie is shared), a fresh anonymous device after
 * sign-out, and the plan as a user property. Renders nothing.
 */
export function AnalyticsProvider() {
  const { isLoaded, userId } = useAuth();
  const plan = useMe().data?.entitlements.plan;

  // Effects run in order, and before those of the pages rendered after this component, so
  // Amplitude is ready when the first page event is sent.
  useEffect(() => initAnalytics(publicEnv.NEXT_PUBLIC_AMPLITUDE_API_KEY), []);
  useEffect(() => {
    if (isLoaded) identifyUser(userId ?? null);
  }, [isLoaded, userId]);
  useEffect(() => {
    if (plan) setUserProperties({ plan });
  }, [plan]);

  return null;
}
