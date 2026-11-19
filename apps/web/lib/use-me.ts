"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "./use-api";

/**
 * The signed-in user's profile, plan and usage (GET /v1/me), cached under ["me"] — the same key
 * the dashboard and billing pages use, so they share one request. Idle when signed out.
 */
export function useMe() {
  const { isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({ queryKey: ["me"], queryFn: () => api.getMe(), enabled: Boolean(isSignedIn) });
}
