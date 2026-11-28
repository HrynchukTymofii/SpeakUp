// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../analytics";
import { PaywallStep } from "./plan-paywall-steps";

// `lib/env` validates the public env at import; the step only needs a valid API URL to load.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const router = vi.hoisted(() => ({ push: vi.fn() }));
const me = vi.hoisted(() => ({ plan: "free" as "free" | "pro" }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/use-me", () => ({
  useMe: () => ({ data: { entitlements: { plan: me.plan } } }),
}));
vi.mock("@/components/pro-price", () => ({ ProPrice: () => "$9.99" }));
// The real button talks to Paddle and polls the API (covered in its own test); here it only has
// to hand the paywall its "Pro is active" moment.
vi.mock("@/components/upgrade-button", () => ({
  UpgradeButton: ({ onActivated }: { onActivated?: () => void }) => (
    <button type="button" onClick={onActivated}>
      Simulate Pro activation
    </button>
  ),
}));

const INSTALL_THEN_APP = "/install?from=funnel&next=%2Fapp";

function renderPaywall() {
  return render(
    <PaywallStep
      step={{ id: "paywall", type: "paywall" }}
      ctx={{ answers: {}, topIssues: [] }}
      onNext={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  me.plan = "free";
});

describe("PaywallStep", () => {
  it("free plan exit opens the install screen, then the app", async () => {
    renderPaywall();
    expect(track).toHaveBeenCalledWith("paywall_viewed", { placement: "funnel" });

    await userEvent.click(screen.getByRole("button", { name: "Continue with the free plan" }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(INSTALL_THEN_APP);
    expect(track).toHaveBeenCalledWith("funnel_free_plan_chosen");
    expect(track).toHaveBeenCalledTimes(2); // paywall_viewed + funnel_free_plan_chosen, as before
  });

  it("after Pro activation the funnel opens the install screen", async () => {
    renderPaywall();

    await userEvent.click(screen.getByRole("button", { name: "Simulate Pro activation" }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/install?from=purchase&next=%2Fapp");
  });

  it("offers no free-plan exit to someone who already has Pro", () => {
    me.plan = "pro";
    renderPaywall();
    expect(
      screen.queryByRole("button", { name: "Continue with the free plan" }),
    ).not.toBeInTheDocument();
  });
});
