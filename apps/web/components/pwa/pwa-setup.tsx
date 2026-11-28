"use client";

import { useEffect } from "react";
// Imported for its side effect: it starts listening for `beforeinstallprompt` as soon as this
// bundle loads, before any install button mounts.
import "@/lib/pwa/install-events";

/**
 * Registers the service worker (public/sw.js) on product pages. Only in production builds: in
 * development a worker would keep serving stale bundles across hot reloads. Renders nothing.
 */
export function PwaSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Without the worker the app still works; it just shows the browser's own offline page.
    });
  }, []);
  return null;
}
