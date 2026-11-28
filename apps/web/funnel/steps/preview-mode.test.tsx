// @vitest-environment jsdom
import { AttemptResultSchema } from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../analytics";
import { funnelApi } from "../api";
import { FUNNEL_STEPS } from "../config";
import { FunnelPreviewScope } from "../funnel-context";
import { PREVIEW_EXERCISE, PREVIEW_RESULT } from "../preview-samples";
import { useFunnelStore } from "../store";
import type { FunnelStep } from "../types";
import type { StepProps } from "./props";
import { STEP_COMPONENTS } from "./index";

/**
 * The funnel editor previews every screen. These are the screens that normally act as soon as
 * they open; in preview mode each one must show sample data and touch nothing: no request for
 * the visitor's session, no analytics, no change to the visitor store, no claim of the
 * (signed-in) admin's own session.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

vi.mock("../analytics", () => ({ track: vi.fn(), setUserProperties: vi.fn() }));
vi.mock("../api", () => ({
  funnelApi: {
    getExercise: vi.fn(),
    getAttemptStatus: vi.fn(),
    createAttempt: vi.fn(),
    submitAttempt: vi.fn(),
  },
}));
const api = vi.hoisted(() => ({ getAttempt: vi.fn(), claimFunnel: vi.fn() }));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));
// The admin previewing is signed in: the real sign-up step would claim their session.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  SignUp: () => <p>Real Clerk form</p>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/components/pro-price", () => ({ ProPrice: () => "$9.99" }));
vi.mock("@/components/upgrade-button", () => ({ UpgradeButton: () => <button>Upgrade</button> }));

// The admin went through the funnel themselves: a token, an attempt, a finished recording.
const ADMIN_OWN_STATE = {
  guestToken: "guest-token",
  attemptId: "att_1",
  completed: ["exercise"],
  claimed: false,
  baselineScore: 12,
};

beforeEach(() => {
  useFunnelStore.setState(ADMIN_OWN_STATE);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderPreview(type: FunnelStep["type"]) {
  const step = FUNNEL_STEPS.find((s) => s.type === type);
  if (!step) throw new Error(type);
  const Component = STEP_COMPONENTS[step.type] as ComponentType<StepProps<FunnelStep["type"]>>;
  const onNext = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FunnelPreviewScope slug="main" steps={FUNNEL_STEPS}>
        <Component step={step as never} ctx={{ answers: {}, topIssues: [] }} onNext={onNext} />
      </FunnelPreviewScope>
    </QueryClientProvider>,
  );
  return { onNext };
}

/** Nothing the preview did reached the API, analytics or the visitor store. */
function expectUntouched() {
  for (const fn of [
    ...Object.values(funnelApi),
    api.getAttempt,
    api.claimFunnel,
    vi.mocked(track),
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
  expect(useFunnelStore.getState()).toMatchObject(ADMIN_OWN_STATE);
}

describe("funnel screens in the editor preview", () => {
  it("the sample result is a valid result", () => {
    expect(AttemptResultSchema.safeParse(PREVIEW_RESULT).success).toBe(true);
  });

  it("recording shows the sample question, not the admin's finished recording", () => {
    renderPreview("recording");
    expect(screen.getByText(PREVIEW_EXERCISE.prompt)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
    expectUntouched();
  });

  it("results show analyzing, then the sample report", () => {
    vi.useFakeTimers();
    // jsdom has no matchMedia; the score's count-up asks for reduced motion.
    window.matchMedia ??= () => ({ matches: true }) as MediaQueryList;
    renderPreview("results");
    expect(screen.getByRole("heading", { name: "Analyzing your speaking…" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByLabelText(`${PREVIEW_RESULT.overallScore} out of 100`)).toBeInTheDocument();
    expectUntouched();
  });

  it("sign-up shows a sample form and never claims the admin's session", () => {
    renderPreview("auth_gate");
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.queryByText("Real Clerk form")).not.toBeInTheDocument();
    expectUntouched();
  });

  it("the plan loader plays and loops without finishing the step", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "performance"] });
    const { onNext } = renderPreview("loader_with_questions");
    // Questions answer themselves after 2 s each, so the 12 s loader reaches the end…
    for (let ms = 0; ms < 17_000; ms += 100) act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText("100%")).toBeInTheDocument();
    // …then starts over instead of moving on.
    for (let ms = 0; ms < 2_000; ms += 100) act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
    expectUntouched();
  });

  it("the plan shows a sample starting score, and the paywall sends no event", () => {
    renderPreview("plan_summary");
    expect(screen.getByText("64/100")).toBeInTheDocument();
    renderPreview("paywall");
    expect(screen.getByRole("button", { name: "Upgrade" })).toBeInTheDocument();
    expectUntouched();
  });
});
