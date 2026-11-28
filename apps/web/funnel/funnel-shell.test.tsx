// @vitest-environment jsdom
import { FUNNEL_OPTIONS, type FunnelDefinition } from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { funnelApi } from "./api";
import { FunnelProvider } from "./funnel-context";
import { FunnelShell } from "./funnel-shell";
import { AuthStep } from "./steps/auth-step";
import { useFunnelStore } from "./store";

/**
 * The shell is shared by every funnel URL (`/start`, `/f/<slug>`): it must take its steps and
 * its URLs from the FunnelProvider, never from the bundled default.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("./api", () => ({
  funnelApi: {
    createSession: vi.fn(() => Promise.resolve({ token: "guest-token" })),
    updateSession: vi.fn(() => Promise.resolve(null)),
    getAttemptStatus: vi.fn(() => new Promise(() => {})),
  },
}));

// Clerk's sign-up form is a black box here: expose the redirect it was given.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  SignUp: (props: { forceRedirectUrl: string; signInForceRedirectUrl: string }) => (
    <div
      data-testid="sign-up"
      data-redirect={props.forceRedirectUrl}
      data-sign-in-redirect={props.signInForceRedirectUrl}
    />
  ),
}));
vi.mock("@/lib/use-api", () => ({ useApi: () => ({ claimFunnel: vi.fn() }) }));

/** A two-step funnel that shares no step ids with the bundled default. */
const definition: FunnelDefinition = {
  version: 1,
  steps: [
    {
      id: "pick-goal",
      type: "single_choice",
      answerKey: "goal",
      title: "Test goal question",
      options: [...FUNNEL_OPTIONS.goal],
    },
    {
      id: "pick-language",
      type: "single_choice",
      answerKey: "language",
      title: "Test language question",
      options: [...FUNNEL_OPTIONS.language],
    },
  ],
};

function inFunnel(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <FunnelProvider slug="test" version={4} definition={definition} basePath="/f/test">
        {children}
      </FunnelProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  useFunnelStore.getState().reset();
  window.history.replaceState(null, "", "/f/test/pick-goal?utm_source=ad&utm_campaign=spring");
});

afterEach(() => vi.clearAllMocks());

describe("FunnelShell", () => {
  it("navigates within its basePath and uses the provider's steps", async () => {
    render(inFunnel(<FunnelShell stepId="pick-goal" />));

    expect(await screen.findByRole("heading", { name: "Test goal question" })).toBeInTheDocument();
    const firstGoal = FUNNEL_OPTIONS.goal[0]?.label ?? "";
    await userEvent.click(screen.getByRole("button", { name: firstGoal }));

    expect(router.push).toHaveBeenCalledWith("/f/test/pick-language");
    expect(useFunnelStore.getState()).toMatchObject({ funnelSlug: "test", funnelVersion: 4 });
  });

  it("creates the guest session with the funnel shown and first-touch UTM", async () => {
    render(inFunnel(<FunnelShell stepId="pick-goal" />));

    await waitFor(() => expect(funnelApi.createSession).toHaveBeenCalledTimes(1));
    expect(funnelApi.createSession).toHaveBeenCalledWith({
      funnel: { slug: "test", version: 4 },
      attribution: { utmSource: "ad", utmCampaign: "spring" },
    });
  });

  it("in an admin's test run, creates a session linked to no funnel and no traffic source", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FunnelProvider
          slug="test"
          version={4}
          definition={definition}
          basePath="/admin/funnels/test/try"
          testRun
        >
          <FunnelShell stepId="pick-goal" />
        </FunnelProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(funnelApi.createSession).toHaveBeenCalledTimes(1));
    expect(funnelApi.createSession).toHaveBeenCalledWith({});
  });

  it("redirects an unknown step to the first step under its basePath", async () => {
    render(inFunnel(<FunnelShell stepId="goal" />));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/f/test/pick-goal"));
  });
});

describe("AuthStep", () => {
  it("returns to <basePath>/auth after sign-up", async () => {
    render(
      inFunnel(
        <AuthStep
          step={{ id: "auth", type: "auth_gate" }}
          ctx={{ answers: {}, topIssues: [] }}
          onNext={vi.fn()}
        />,
      ),
    );

    const signUp = await screen.findByTestId("sign-up");
    expect(signUp).toHaveAttribute("data-redirect", "/f/test/auth");
    expect(signUp).toHaveAttribute("data-sign-in-redirect", "/f/test/auth");
  });
});
