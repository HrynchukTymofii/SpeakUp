import { describe, expect, it } from "vitest";
import { detectInstallPlatform, type InstallPlatform } from "./install-platform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ asks for the desktop site: it reports itself as a Mac, but with touch.
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,5; iOS 17_5; en_US)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/466.0.0.0;]",
  tiktok:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36 musical_ly_2023405030 BytedanceWebview/d8a21c6",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  firefoxDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

const base = {
  standalone: false,
  navigatorStandalone: false,
  maxTouchPoints: 0,
  hasDeferredPrompt: false,
};

describe("detectInstallPlatform", () => {
  it.each<[string, Partial<typeof base> & { userAgent: string }, InstallPlatform]>([
    [
      "standalone wins over everything",
      { userAgent: UA.chromeAndroid, standalone: true, hasDeferredPrompt: true },
      "standalone",
    ],
    [
      "iOS home-screen app (navigator.standalone)",
      { userAgent: UA.iphoneSafari, navigatorStandalone: true, maxTouchPoints: 5 },
      "standalone",
    ],
    ["iPhone Safari", { userAgent: UA.iphoneSafari, maxTouchPoints: 5 }, "ios"],
    ["iPadOS posing as a Mac", { userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 }, "ios"],
    ["Instagram webview", { userAgent: UA.instagram, maxTouchPoints: 5 }, "in_app_browser"],
    ["Facebook webview", { userAgent: UA.facebookAndroid, maxTouchPoints: 5 }, "in_app_browser"],
    ["TikTok webview", { userAgent: UA.tiktok, maxTouchPoints: 5 }, "in_app_browser"],
    [
      "Chrome with a captured prompt",
      { userAgent: UA.chromeAndroid, maxTouchPoints: 5, hasDeferredPrompt: true },
      "prompt",
    ],
    [
      "Chrome before the prompt arrives",
      { userAgent: UA.chromeAndroid, maxTouchPoints: 5 },
      "manual",
    ],
    ["desktop Firefox", { userAgent: UA.firefoxDesktop }, "manual"],
    ["desktop Safari (no touch)", { userAgent: UA.macSafari }, "manual"],
  ])("%s", (_name, input, expected) => {
    expect(detectInstallPlatform({ ...base, ...input })).toBe(expected);
  });
});
