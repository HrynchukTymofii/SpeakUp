"use client";

import { createContext, useContext } from "react";

/**
 * True inside the funnel editor's screen preview (`/admin/funnels/<slug>`). Steps render there
 * as visitors see them but must not act on their own: no API calls for the visitor's session,
 * no analytics, no writes to the visitor store, no microphone, no sign-up, no autoplay. Screens
 * that show a visitor's own data use `preview-samples.ts` instead.
 */
export const FunnelPreviewContext = createContext(false);

export const useIsFunnelPreview = () => useContext(FunnelPreviewContext);
