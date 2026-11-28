// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/funnel/analytics", () => ({ track }));

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

/** A stand-in for Chrome's BeforeInstallPromptEvent (jsdom doesn't have it). */
function fakeInstallPrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome, platform: "web" });
  return event;
}

// The module keeps the captured prompt in module state: load a fresh copy per test.
async function load() {
  vi.resetModules();
  return import("./install-events");
}

beforeEach(() => {
  track.mockReset();
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(CHROME_ANDROID);
});
afterEach(() => vi.restoreAllMocks());

describe("install events", () => {
  it("captures beforeinstallprompt fired before any component mounts", async () => {
    const { useInstall } = await load();
    const event = fakeInstallPrompt("accepted");
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const { result } = renderHook(() => useInstall());
    expect(result.current.platform).toBe("prompt");
  });

  it("shows the browser prompt once and reports the choice", async () => {
    const { useInstall } = await load();
    const event = fakeInstallPrompt("dismissed");
    window.dispatchEvent(event);
    const { result } = renderHook(() => useInstall());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(outcome).toBe("dismissed");
    // The browser allows each captured prompt to be shown only once.
    expect(result.current.platform).toBe("manual");
  });

  it("tracks app_installed and stops offering the install", async () => {
    const { useInstall } = await load();
    window.dispatchEvent(fakeInstallPrompt("accepted"));
    const { result } = renderHook(() => useInstall());

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(track).toHaveBeenCalledWith("app_installed");
    expect(result.current.platform).toBe("standalone");
  });
});
