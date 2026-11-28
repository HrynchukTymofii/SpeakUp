// @vitest-environment jsdom
import {
  DEFAULT_FUNNEL_DEFINITION,
  type AdminFunnelDetailResponse,
  type FunnelDefinition,
} from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFunnelStore } from "@/funnel/store";
import { TryFunnel } from "./try-funnel";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const api = vi.hoisted(() => ({ getAdminFunnel: vi.fn() }));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/admin/funnels/spring/try/goal",
}));
// The real provider is client-only (dynamic import); record what it's given instead.
const provided = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("../../../../start/funnel-client", () => ({
  FunnelProviderClient: (props: Record<string, unknown> & { children: ReactNode }) => {
    provided.props = props;
    return <div>{props.children}</div>;
  },
}));

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.clearAllMocks());

const SHORT: FunnelDefinition = { version: 1, steps: DEFAULT_FUNNEL_DEFINITION.steps.slice(0, 3) };

function detail(draft: FunnelDefinition | null, draftInvalid = false): AdminFunnelDetailResponse {
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
    draftInvalid,
  };
}

function renderTry(step: ReactNode = <p>step</p>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TryFunnel slug="spring">{step}</TryFunnel>
    </QueryClientProvider>,
  );
}

/** A step with its own state: if the funnel remounts, the count goes back to 0. */
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Tapped {count}
    </button>
  );
}

/** The frame's scroll container, marked with the device it draws. */
function viewport(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>("[data-device]");
  if (!el) throw new Error("no viewport");
  return el;
}

const DEVICE_KEY = "speakup.funnel-preview-device";

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

  it("shows no banner: the test-run notes are only a tooltip and screen-reader text", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(SHORT));
    renderTry();
    const note = await screen.findByText(/Test run of Spring/);
    expect(note).toHaveClass("sr-only");
    expect(note).toHaveTextContent(/Checkout is real: pick the free plan/);
    expect(screen.queryByText(/sign-up step skips the form/)).not.toBeInTheDocument();
    const marker = screen.getByTestId("test-run-marker");
    expect(marker).toHaveAttribute("title", expect.stringMatching(/Test run of Spring/));
    expect(marker).toHaveClass("bg-brand");
  });

  it("dock links back to the editor and starts over", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(null));
    renderTry();
    const dock = await screen.findByRole("complementary", { name: "Test run" });
    expect(within(dock).getByRole("link", { name: "Back to the editor" })).toHaveAttribute(
      "href",
      "/admin/funnels/spring",
    );
    await userEvent.click(within(dock).getByRole("button", { name: "Start over" }));
    expect(router.replace).toHaveBeenCalledWith("/admin/funnels/spring/try");
  });

  it("switches between the phone and the desktop frame without restarting the funnel", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(null));
    const { container } = renderTry(<Counter />);
    await userEvent.click(await screen.findByRole("button", { name: "Tapped 0" }));
    expect(viewport(container)).toHaveAttribute("data-device", "phone");
    const phone = screen.getByRole("button", { name: "Phone" });
    const desktop = screen.getByRole("button", { name: "Desktop" });
    expect(phone).toHaveAttribute("aria-pressed", "true");
    expect(desktop).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(desktop);
    expect(viewport(container)).toHaveAttribute("data-device", "web");
    expect(screen.getByText("/f/spring")).toBeInTheDocument();
    expect(desktop).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tapped 1" })).toBeInTheDocument();

    await userEvent.click(phone);
    expect(viewport(container)).toHaveAttribute("data-device", "phone");
    expect(screen.getByRole("button", { name: "Tapped 1" })).toBeInTheDocument();
  });

  it("reaches the dock controls in order with the keyboard", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(null));
    renderTry();
    const phone = await screen.findByRole("button", { name: "Phone" });
    for (let i = 0; i < 20 && document.activeElement !== phone; i++) await userEvent.tab();
    expect(phone).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Start over" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Back to the editor" })).toHaveFocus();
  });

  it("flags a saved draft that no longer passes the checks", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(SHORT, true));
    renderTry();
    const note = await screen.findByText(/Test run of Spring/);
    expect(note).toHaveTextContent(/saved changes no longer pass the checks/);
    const marker = screen.getByTestId("test-run-marker");
    expect(marker).toHaveClass("bg-danger");
    expect(marker).toHaveAttribute("title", expect.stringMatching(/no longer pass the checks/));
  });

  it("remembers the device choice", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(null));
    const first = renderTry();
    await userEvent.click(await screen.findByRole("button", { name: "Desktop" }));
    expect(window.localStorage.getItem(DEVICE_KEY)).toBe("web");
    first.unmount();

    const { container } = renderTry();
    await screen.findByRole("button", { name: "Desktop" });
    expect(viewport(container)).toHaveAttribute("data-device", "web");
  });

  it("ignores a stored device it doesn't know", async () => {
    window.localStorage.setItem(DEVICE_KEY, "tablet");
    api.getAdminFunnel.mockResolvedValue(detail(null));
    const { container } = renderTry();
    await screen.findByRole("button", { name: "Phone" });
    expect(viewport(container)).toHaveAttribute("data-device", "phone");
  });
});
