"use client";

import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";
import { createApiClient, type ApiClient } from "./api";

/**
 * The API client for client components, wired to the current Clerk session.
 * `getToken()` returns a short-lived JWT (Clerk refreshes it in the background), which the
 * API verifies on every request — the browser never sends our API a cookie.
 */
export function useApi(): ApiClient {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(() => getToken()), [getToken]);
}
