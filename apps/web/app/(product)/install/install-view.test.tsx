// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallPlatform } from "@/lib/pwa/install-platform";
import { InstallView } from "./install-view";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const query = vi.hoisted(() => ({ current: new URLSearchParams() }));
const install = vi.hoisted(() => ({
  platform: "manual" as InstallPlatform | null,
  promptInstall: vi.fn(),
}));
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => query.current,
}));
vi.mock("@/lib/pwa/install-events", () => ({ useInstall: () => install }));
vi.mock("@/funnel/analytics", () => ({ track: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));

beforeEach(() => {
  router.replace.mockReset();
  query.current = new URLSearchParams();
  install.platform = "manual";
  auth.isLoaded = true;
  auth.isSignedIn = false;
});

describe("InstallView", () => {
  it("redirects to next when already installed", () => {
    install.platform = "standalone";
    query.current = new URLSearchParams({ from: "funnel", next: "/app/practice" });
    render(<InstallView />);
    expect(router.replace).toHaveBeenCalledWith("/app/practice");
  });

  it("waits for the browser before deciding (no redirect during hydration)", () => {
    install.platform = null;
    query.current = new URLSearchParams({ from: "funnel", next: "/app/practice" });
    render(<InstallView />);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("never redirects off the site, whatever next says", () => {
    install.platform = "standalone";
    query.current = new URLSearchParams({ from: "funnel", next: "//evil.example" });
    render(<InstallView />);
    expect(router.replace).toHaveBeenCalledWith("/app");
  });

  it("shows the install card and a continue link", () => {
    query.current = new URLSearchParams({ from: "funnel", next: "/app/practice" });
    render(<InstallView />);
    expect(screen.getByRole("heading", { name: "Get SpeakUp on your home screen" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Not now, continue" })).toHaveAttribute(
      "href",
      "/app/practice",
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("offers signed-out visitors from the landing the speaking check", () => {
    query.current = new URLSearchParams({ from: "landing" });
    render(<InstallView />);
    expect(screen.getByRole("link", { name: /take the 2-minute speaking check/i })).toHaveAttribute(
      "href",
      "/start",
    );
  });

  it("doesn't offer the speaking check to signed-in visitors or after the funnel", () => {
    auth.isSignedIn = true;
    query.current = new URLSearchParams({ from: "landing" });
    const { unmount } = render(<InstallView />);
    expect(screen.queryByRole("link", { name: /speaking check/i })).toBeNull();
    unmount();

    auth.isSignedIn = false;
    query.current = new URLSearchParams({ from: "funnel" });
    render(<InstallView />);
    expect(screen.queryByRole("link", { name: /speaking check/i })).toBeNull();
  });
});
