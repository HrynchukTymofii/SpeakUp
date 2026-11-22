// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppTabBar } from "./app-tab-bar";

const pathname = vi.hoisted(() => ({ current: "/app" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("AppTabBar", () => {
  it("shows every tab with a visible label", () => {
    render(<AppTabBar />);
    for (const label of ["Learn", "Practice", "Challenges", "Profile"]) {
      // Visible text, not just an aria-label: the Glow tab bar labels its icons.
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it("marks only the tab for the current section as the current page", () => {
    pathname.current = "/app/practice/one-minute";
    render(<AppTabBar />);
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute("aria-current", "page");
    for (const other of ["Learn", "Challenges", "Profile"]) {
      expect(screen.getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
    }
  });

  it("treats billing as part of the profile tab", () => {
    pathname.current = "/app/billing";
    render(<AppTabBar />);
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });
});
