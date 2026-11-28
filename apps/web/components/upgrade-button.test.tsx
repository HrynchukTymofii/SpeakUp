// @vitest-environment jsdom
import { ErrorCode } from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
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
const paddle = vi.hoisted(() => ({
  listeners: [] as Array<(event: unknown) => void>,
  emit(event: unknown) {
    paddle.listeners.forEach((listener) => listener(event));
  },
}));
const track = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/start/paywall" }));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));
vi.mock("@/lib/paddle", () => ({
  paddleConfigured: () => true,
  getPaddle: () => Promise.resolve({ Checkout: { open: vi.fn() } }),
  onPaddleEvent: (listener: (event: unknown) => void) => {
    paddle.listeners.push(listener);
    return () => {
      paddle.listeners = paddle.listeners.filter((l) => l !== listener);
    };
  },
}));
vi.mock("@/funnel/analytics", () => ({ track }));
// A browser that can show the native install prompt (Chrome on Android).
vi.mock("@/lib/pwa/install-events", () => ({
  useInstall: () => ({ platform: "prompt", promptInstall: vi.fn() }),
}));

const me = (plan: "free" | "pro") => ({ entitlements: { plan } });

function renderButton(ui: ReactNode = <UpgradeButton placement="funnel" />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  api.getMe.mockReset();
  api.startCheckout.mockReset();
  track.mockReset();
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

  it("reports an abandoned checkout, then a paid one with its revenue", async () => {
    api.getMe.mockResolvedValue(me("free"));
    api.startCheckout.mockResolvedValue({ priceId: "pri_1", customData: {} });
    renderButton();
    const upgrade = await screen.findByRole("button", { name: "Upgrade to Pro" });

    await userEvent.click(upgrade);
    act(() => paddle.emit({ name: "checkout.closed" }));
    expect(track).toHaveBeenCalledWith("checkout_closed", { placement: "funnel" });

    await userEvent.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));
    act(() =>
      paddle.emit({
        name: "checkout.completed",
        data: { totals: { total: 9.99 }, currency_code: "USD" },
      }),
    );
    expect(track).toHaveBeenCalledWith(
      "checkout_completed",
      { placement: "funnel" },
      { amount: 9.99, currency: "USD" },
    );
    expect(track).toHaveBeenCalledTimes(4); // 2× checkout_started, closed, completed
  });

  async function payAndActivate(placement: "pricing" | "funnel", onActivated = vi.fn()) {
    api.getMe.mockResolvedValueOnce(me("free")).mockResolvedValue(me("pro"));
    api.startCheckout.mockResolvedValue({ priceId: "pri_1", customData: {} });
    renderButton(<UpgradeButton placement={placement} onActivated={onActivated} />);
    await userEvent.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));
    act(() => paddle.emit({ name: "checkout.completed", data: {} }));
    expect(await screen.findByText(/You’re on SpeakUp Pro/)).toBeInTheDocument();
    return onActivated;
  }

  it("after activation on /pricing, offers to install the app", async () => {
    const onActivated = await payAndActivate("pricing");
    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Get SpeakUp on your home screen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Install the app" })).toBeVisible();
    expect(track).toHaveBeenCalledWith("pro_activated", { placement: "pricing" });
    expect(track).toHaveBeenCalledWith("install_prompt_shown", {
      placement: "purchase",
      platform: "prompt",
    });
  });

  it("leaves the install offer to the install screen in the funnel", async () => {
    // The funnel paywall navigates to /install itself after activation (see PaywallStep).
    const onActivated = await payAndActivate("funnel");
    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("pro_activated", { placement: "funnel" });
    expect(
      screen.queryByRole("heading", { name: "Get SpeakUp on your home screen" }),
    ).not.toBeInTheDocument();
    expect(track).not.toHaveBeenCalledWith("install_prompt_shown", expect.anything());
  });
});
