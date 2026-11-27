import { describe, expect, it, vi } from "vitest";

// proxy.ts pulls in Clerk and the validated env at import time; only its matcher is under test.
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => undefined }));
vi.mock("./lib/env", () => ({ publicEnv: {} }));

const { config } = await import("./proxy");

/** Next anchors a matcher to the whole path; do the same here. */
const runsOn = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe("proxy matcher", () => {
  it.each(["/sw.js", "/speakup.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png"])(
    "skips PWA asset %s, so host routing never redirects it",
    (pathname) => {
      expect(runsOn(pathname)).toBe(false);
    },
  );

  it.each(["/install", "/offline", "/app"])("runs on page route %s", (pathname) => {
    expect(runsOn(pathname)).toBe(true);
  });
});
