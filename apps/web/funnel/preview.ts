"use client";

import { createContext, useContext } from "react";

/**
 * True inside the funnel editor's screen preview (`/admin/funnels/<slug>`). Steps render there
 * as visitors see them but must not act on their own: the lesson video doesn't autoplay (with
 * sound, after the admin's click).
 */
export const FunnelPreviewContext = createContext(false);

export const useIsFunnelPreview = () => useContext(FunnelPreviewContext);
