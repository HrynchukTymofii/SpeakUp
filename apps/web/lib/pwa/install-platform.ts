/**
 * How this browser can put SpeakUp on the home screen. Pure, so it can be tested with plain
 * values; `install-events.ts` reads them from the real browser.
 *
 * - `standalone`: already running as the installed app (or just installed), nothing to offer.
 * - `in_app_browser`: Instagram, Facebook or TikTok webview. These can't install a web app, so we
 *   ask people to open the page in Safari or Chrome.
 * - `prompt`: the browser fired `beforeinstallprompt` (Chrome, Edge, Samsung Internet), so one
 *   button can show the native install dialog.
 * - `ios`: iPhone or iPad. Safari never fires `beforeinstallprompt`; installing is Share → Add to
 *   Home Screen.
 * - `manual`: anything else (desktop Firefox and Safari, Chrome before the prompt arrives). We
 *   point to the browser's own menu.
 */
export type InstallPlatform = "standalone" | "in_app_browser" | "prompt" | "ios" | "manual";

/** Where an install offer was shown; sent with the install analytics events. */
export const INSTALL_PLACEMENTS = ["landing", "funnel", "purchase", "direct"] as const;
export type InstallPlacement = (typeof INSTALL_PLACEMENTS)[number];

export interface InstallSignals {
  /** `matchMedia("(display-mode: standalone)")` matched, or the app was just installed. */
  standalone: boolean;
  /** Safari's non-standard `navigator.standalone` (true in an iOS home-screen app). */
  navigatorStandalone: boolean;
  userAgent: string;
  maxTouchPoints: number;
  /** A `beforeinstallprompt` event was captured and not used yet. */
  hasDeferredPrompt: boolean;
}

const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview/i;
const IOS = /iPhone|iPad|iPod/;

export function detectInstallPlatform(signals: InstallSignals): InstallPlatform {
  if (signals.standalone || signals.navigatorStandalone) return "standalone";
  // Before the prompt check: an in-app webview can't install even if it fired the event.
  if (IN_APP_BROWSER.test(signals.userAgent)) return "in_app_browser";
  if (signals.hasDeferredPrompt) return "prompt";
  // iPadOS 13+ requests the desktop site and reports "Macintosh"; only touch gives it away.
  const iPadAsMac = /Macintosh/.test(signals.userAgent) && signals.maxTouchPoints > 1;
  if (IOS.test(signals.userAgent) || iPadAsMac) return "ios";
  return "manual";
}
