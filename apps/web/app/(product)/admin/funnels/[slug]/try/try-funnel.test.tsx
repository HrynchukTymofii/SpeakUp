// @vitest-environment jsdom
import {
  DEFAULT_FUNNEL_DEFINITION,
  type AdminFunnelDetailResponse,
  type FunnelDefinition,
} from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFunnelStore } from "@/funnel/store";
import { TryFunnel } from "./try-funnel";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const api = vi.hoisted(() => ({ getAdminFunnel: vi.fn() }));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The real provider is client-only (dynamic import); record what it's given instead.
const provided = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("../../../../start/funnel-client", () => ({
  FunnelProviderClient: (props: Record<string, unknown> & { children: ReactNode }) => {
    provided.props = props;
    return <div>{props.children}</div>;
  },
}));

afterEach(() => vi.clearAllMocks());

const SHORT: FunnelDefinition = { version: 1, steps: DEFAULT_FUNNEL_DEFINITION.steps.slice(0, 3) };

function detail(draft: FunnelDefinition | null): AdminFunnelDetailResponse {
  return {
    funnel: {
      slug: "spring",
      name: "Spring",
      status: "draft",
      version: 2,
      updatedAt: "2026-11-02T10:00:00.000Z",
      hasDraft: draft !== null,
      sessions30d: { started: 0, signedUp: 0 },
    },
    definition: DEFAULT_FUNNEL_DEFINITION,
    draft,
    draftInvalid: false,
  };
}

function renderTry() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TryFunnel slug="spring">
        <p>step</p>
      </TryFunnel>
    </QueryClientProvider>,
  );
}

describe("TryFunnel (test run)", () => {
  it("runs the saved draft under the admin path, marked as a test run", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(SHORT));
    renderTry();
    expect(await screen.findByText(/Test run of Spring/)).toBeInTheDocument();
    expect(screen.getByText(/with the unpublished changes/)).toBeInTheDocument();
    expect(provided.props).toMatchObject({
      slug: "spring",
      version: 2,
      definition: SHORT,
      basePath: "/admin/funnels/spring/try",
      testRun: true,
    });
  });

  it("runs what visitors see when there's no draft", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(null));
    renderTry();
    await screen.findByText(/Test run of Spring/);
    expect(provided.props?.definition).toEqual(DEFAULT_FUNNEL_DEFINITION);
  });

  it("start over forgets the earlier run and goes back to the first step", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(null));
    useFunnelStore.setState({
      funnelSlug: "test:spring",
      answers: { goal: "job-interviews" },
      attemptId: "att_1",
      claimed: true,
    });
    renderTry();
    await userEvent.click(await screen.findByRole("button", { name: "Start over" }));
    expect(useFunnelStore.getState()).toMatchObject({
      funnelSlug: "test:spring",
      funnelVersion: 2,
      answers: {},
      attemptId: null,
      claimed: false,
    });
    expect(router.replace).toHaveBeenCalledWith("/admin/funnels/spring/try");
  });
});
