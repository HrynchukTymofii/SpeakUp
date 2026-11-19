// @vitest-environment jsdom
import { ErrorCode } from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api";
import { UpgradeButton } from "./upgrade-button";

// lib/env.ts validates on import (via lib/api), before any test code runs.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
});

const api = { getMe: vi.fn(), startCheckout: vi.fn() };

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/start/paywall" }));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));
vi.mock("@/lib/paddle", () => ({
  paddleConfigured: () => true,
  getPaddle: () => Promise.resolve({ Checkout: { open: vi.fn() } }),
  onPaddleEvent: () => () => {},
}));

const me = (plan: "free" | "pro") => ({ entitlements: { plan } });

function renderButton(ui: ReactNode = <UpgradeButton placement="funnel" />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  api.getMe.mockReset();
  api.startCheckout.mockReset();
});

describe("UpgradeButton", () => {
  it("offers the upgrade to a free user", async () => {
    api.getMe.mockResolvedValue(me("free"));
    renderButton();
    expect(await screen.findByRole("button", { name: "Upgrade to Pro" })).toBeEnabled();
  });

  it("doesn't offer the upgrade to someone who already has Pro", async () => {
    // Regression: a Pro user on the funnel paywall saw "Upgrade to Pro"; pressing it showed a red
    // "You already have SpeakUp Pro." and the only way on was "Continue with the free plan".
    api.getMe.mockResolvedValue(me("pro"));
    renderButton();
    expect(await screen.findByText(/already on SpeakUp Pro/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).not.toBeInTheDocument();
  });

  it("switches to the Pro state, not an error, when checkout says the user is already Pro", async () => {
    // The plan loaded as free, but the account became Pro meanwhile (e.g. paid in another tab).
    api.getMe.mockResolvedValueOnce(me("free")).mockResolvedValue(me("pro"));
    api.startCheckout.mockRejectedValue(
      new ApiClientError(409, ErrorCode.WRONG_STATE, "already subscribed"),
    );
    renderButton();
    await userEvent.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));
    expect(await screen.findByText(/already on SpeakUp Pro/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
