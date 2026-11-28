// @vitest-environment jsdom
import type { AdminFunnel } from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api";
import { FunnelsView } from "./funnels-view";

// `lib/env` validates the public env at import; the view only needs a valid API URL to load.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const funnel = (overrides: Partial<AdminFunnel>): AdminFunnel => ({
  slug: "main",
  name: "Main funnel",
  status: "live",
  version: 3,
  updatedAt: "2026-11-01T10:00:00.000Z",
  hasDraft: false,
  sessions30d: { started: 200, signedUp: 50 },
  ...overrides,
});

const api = vi.hoisted(() => ({
  getAdminFunnels: vi.fn(),
  setFunnelStatus: vi.fn(),
  duplicateFunnel: vi.fn(),
}));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));

afterEach(() => {
  vi.resetAllMocks();
});

/** `appRetry`: the app's real default (one retry, `app/providers.tsx`) instead of none. */
function renderView({ appRetry = false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: appRetry ? 1 : false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FunnelsView />
    </QueryClientProvider>,
  );
}

function cardFor(name: string) {
  return screen.getByRole("heading", { name }).closest("article") as HTMLElement;
}

describe("FunnelsView", () => {
  it("lists funnels with status, version, 30-day numbers and a link to live ones only", async () => {
    api.getAdminFunnels.mockResolvedValue({
      funnels: [
        funnel({}),
        funnel({
          slug: "spring-sale",
          name: "Spring sale",
          status: "draft",
          version: 1,
          sessions30d: { started: 0, signedUp: 0 },
        }),
      ],
    });
    renderView();

    await screen.findByRole("heading", { name: "Main funnel" });
    const main = cardFor("Main funnel");
    expect(within(main).getByText("Live")).toBeInTheDocument();
    expect(within(main).getByText(/Version 3/)).toBeInTheDocument();
    expect(within(main).getByText("200")).toBeInTheDocument();
    expect(within(main).getByText("50 (25%)")).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: /\/f\/main/ })).toHaveAttribute(
      "href",
      "/f/main",
    );
    // main is the default funnel: there is no way to take it offline.
    expect(within(main).queryByRole("button", { name: /offline/i })).not.toBeInTheDocument();

    const spring = cardFor("Spring sale");
    expect(within(spring).getByText("Draft")).toBeInTheDocument();
    expect(within(spring).getByText("0 (0%)")).toBeInTheDocument();
    // Drafts 404 for visitors, so no link to them; only the editor link.
    expect(
      within(spring)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/admin/funnels/spring-sale"]);
  });

  it("takes a draft live and refreshes the list", async () => {
    api.getAdminFunnels
      .mockResolvedValueOnce({
        funnels: [funnel({ slug: "spring", name: "Spring", status: "draft" })],
      })
      .mockResolvedValue({ funnels: [funnel({ slug: "spring", name: "Spring", status: "live" })] });
    api.setFunnelStatus.mockResolvedValue({
      funnel: funnel({ slug: "spring", name: "Spring", status: "live" }),
    });
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: "Take live" }));
    expect(api.setFunnelStatus).toHaveBeenCalledWith("spring", "live");
    expect(await screen.findByRole("button", { name: "Take offline" })).toBeInTheDocument();
  });

  it("duplicates a funnel under a new slug and name", async () => {
    api.getAdminFunnels.mockResolvedValue({ funnels: [funnel({})] });
    api.duplicateFunnel.mockResolvedValue({
      funnel: funnel({ slug: "tiktok-nov", name: "TikTok November", status: "draft", version: 1 }),
    });
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
    await userEvent.type(screen.getByLabelText("New link"), "tiktok-nov");
    await userEvent.type(screen.getByLabelText("Name"), "TikTok November");
    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(api.duplicateFunnel).toHaveBeenCalledWith("main", {
      slug: "tiktok-nov",
      name: "TikTok November",
    });
  });

  it("shows the API's message when an action is refused", async () => {
    api.getAdminFunnels.mockResolvedValue({ funnels: [funnel({})] });
    api.duplicateFunnel.mockRejectedValue(
      new ApiClientError(409, "WRONG_STATE", '"main" is already used'),
    );
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
    await userEvent.type(screen.getByLabelText("New link"), "main");
    await userEvent.type(screen.getByLabelText("Name"), "Again");
    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('"main" is already used');
  });

  it("action buttons keep a 44 px tap target", async () => {
    api.getAdminFunnels.mockResolvedValue({
      funnels: [funnel({}), funnel({ slug: "spring", name: "Spring", status: "draft" })],
    });
    renderView();
    await userEvent.click((await screen.findAllByRole("button", { name: "Duplicate" }))[0]!);
    for (const name of ["Take live", "Duplicate", "Create draft", "Cancel"]) {
      for (const button of screen.getAllByRole("button", { name })) {
        expect(button).toHaveClass("min-h-11");
      }
    }
  });

  it("moves focus into the duplicate form and back to Duplicate when it closes", async () => {
    api.getAdminFunnels.mockResolvedValue({ funnels: [funnel({})] });
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText("New link")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Duplicate" })).toHaveFocus();
  });

  it("shows a no-access screen to signed-in users who aren't admins, without retrying", async () => {
    api.getAdminFunnels.mockRejectedValue(new ApiClientError(403, "FORBIDDEN", "Admins only"));
    renderView({ appRetry: true });

    expect(await screen.findByRole("heading", { name: "This page is for admins" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Back to the app/ })).toHaveAttribute("href", "/app");
    // A 403 won't change by asking again.
    expect(api.getAdminFunnels).toHaveBeenCalledTimes(1);
  });

  it("links each funnel to its editor and flags unpublished changes", async () => {
    api.getAdminFunnels.mockResolvedValue({
      funnels: [funnel({}), funnel({ slug: "spring", name: "Spring", hasDraft: true })],
    });
    renderView();
    await screen.findByRole("heading", { name: "Main funnel" });
    const main = cardFor("Main funnel");
    expect(within(main).getByRole("link", { name: "Edit screens" })).toHaveAttribute(
      "href",
      "/admin/funnels/main",
    );
    expect(within(main).queryByText("Has unpublished changes")).not.toBeInTheDocument();
    expect(within(cardFor("Spring")).getByText("Has unpublished changes")).toBeInTheDocument();
  });
});
