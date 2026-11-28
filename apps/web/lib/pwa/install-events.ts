"use client";

import { useCallback, useSyncExternalStore } from "react";
import { track } from "@/funnel/analytics";
import { detectInstallPlatform, type InstallPlatform } from "./install-platform";

/**
 * Chrome's `beforeinstallprompt` event (not in the DOM typings). It can fire as soon as the page
 * loads, before React mounts, so the listeners below are registered when this module is imported,
 * not in a component effect.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini-infobar away; we show the prompt from our button instead.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    track("app_installed");
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Opening the installed app or leaving it changes the display mode without any install event.
  const media = window.matchMedia?.("(display-mode: standalone)");
  media?.addEventListener?.("change", listener);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener?.("change", listener);
  };
}

function getSnapshot(): InstallPlatform {
  const nav = navigator as Navigator & { standalone?: boolean };
  return detectInstallPlatform({
    standalone: installed || (window.matchMedia?.("(display-mode: standalone)").matches ?? false),
    navigatorStandalone: nav.standalone === true,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    hasDeferredPrompt: deferredPrompt !== null,
  });
}

/** The server can't know the browser: `null` until the client has rendered. */
const getServerSnapshot = (): InstallPlatform | null => null;

export type InstallOutcome = "accepted" | "dismissed";

/**
 * The current install platform (`null` during server render and hydration) and a function that
 * shows the browser's install dialog. `promptInstall` resolves `"dismissed"` when there is no
 * captured prompt to show.
 */
export function useInstall(): {
  platform: InstallPlatform | null;
  promptInstall: () => Promise<InstallOutcome>;
} {
  const platform = useSyncExternalStore<InstallPlatform | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferredPrompt;
    if (!event) return "dismissed";
    // A captured prompt can be shown only once; drop it before awaiting so a double tap can't
    // reuse it.
    deferredPrompt = null;
    notify();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  }, []);
  return { platform, promptInstall };
}
