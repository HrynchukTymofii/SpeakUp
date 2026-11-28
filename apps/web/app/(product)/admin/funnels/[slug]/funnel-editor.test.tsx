// @vitest-environment jsdom
import {
  DEFAULT_FUNNEL_DEFINITION,
  type AdminFunnelDetailResponse,
  type FunnelDefinition,
  type FunnelStepDef,
} from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api";
import { PREVIEW_EXERCISE } from "@/funnel/preview-samples";
import { FunnelEditor } from "./funnel-editor";
import { PHONE } from "./screen-preview";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const api = vi.hoisted(() => ({
  getAdminFunnel: vi.fn(),
  saveFunnelDraft: vi.fn(),
  publishFunnel: vi.fn(),
  discardFunnelDraft: vi.fn(),
}));
vi.mock("@/lib/use-api", () => ({ useApi: () => api }));
// The preview renders real steps; some of them hold a router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/funnels/spring",
}));
// The screen gallery renders every screen, sign-up and paywall included.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  SignUp: () => null,
}));
vi.mock("@/lib/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/components/pro-price", () => ({ ProPrice: () => "$9.99" }));

afterEach(() => {
  vi.resetAllMocks();
});

const byId = (id: string): FunnelStepDef => {
  const step = DEFAULT_FUNNEL_DEFINITION.steps.find((s) => s.id === id);
  if (!step) throw new Error(id);
  return step;
};
const def = (...ids: string[]): FunnelDefinition => ({ version: 1, steps: ids.map(byId) });

function detail(
  definition: FunnelDefinition,
  draft: FunnelDefinition | null = null,
  version = 2,
  updatedAt = "2026-11-02T10:00:00.000Z",
): AdminFunnelDetailResponse {
  return {
    funnel: {
      slug: "spring",
      name: "Spring",
      status: "live",
      version,
      updatedAt,
      hasDraft: draft !== null,
      sessions30d: { started: 0, signedUp: 0 },
    },
    definition,
    draft,
    draftInvalid: false,
  };
}

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FunnelEditor slug="spring" />
    </QueryClientProvider>,
  );
}

/** The screen names, in list order. */
function names() {
  const list = screen.getByRole("heading", { name: "Screens, in order" }).parentElement;
  const rows = list?.querySelectorAll(":scope > ol > li") ?? [];
  return [...rows].map((li) => li.querySelector("button span:nth-child(2) span")?.textContent);
}

const NAME = {
  goal: "What do you most want to improve?",
  time: "How much time can you practice per day?",
  language: "Is English your first language?",
  exercise: "Record the speaking check",
  results: "Speaking check results",
};

describe("FunnelEditor", () => {
  it("lists the screens in order and previews the selected one as visitors see it", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal", "time", "exercise")));
    renderEditor();

    await screen.findByRole("heading", { name: "Spring" });
    expect(names()).toEqual([NAME.goal, NAME.time, NAME.exercise]);
    // The first screen is previewed: the real question, but nothing in it can be pressed.
    const preview = screen.getByTestId("live-preview");
    expect(preview).toHaveAttribute("inert");
    expect(within(preview).getByRole("heading", { name: NAME.goal })).toBeInTheDocument();

    // Drawn at a real phone viewport, with the funnel's progress bar above the question.
    const phone = screen.getByTestId("phone").firstElementChild as HTMLElement;
    expect(phone.style.width).toBe(`${PHONE.width + 24}px`);
    expect(phone.style.height).toBe(`${PHONE.height + 24}px`);
    expect(within(preview).getByRole("progressbar")).toBeInTheDocument();

    // Screens that act on their own are shown too, with sample data.
    await userEvent.click(
      screen.getByRole("button", { pressed: false, name: new RegExp(NAME.exercise) }),
    );
    expect(
      within(screen.getByTestId("live-preview")).getByText(PREVIEW_EXERCISE.prompt),
    ).toBeInTheDocument();
    expect(api.getAdminFunnel).toHaveBeenCalledTimes(1);
  });

  it("moves, removes and adds screens, then saves them as a draft", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal", "time", "exercise")));
    api.saveFunnelDraft.mockImplementation(async (_slug: string, definition: FunnelDefinition) =>
      detail(def("goal", "time", "exercise"), definition, 2, "2026-11-03T10:00:00.000Z"),
    );
    renderEditor();
    await screen.findByRole("heading", { name: "Spring" });
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: `Move “${NAME.goal}” down` }));
    await userEvent.click(screen.getByRole("button", { name: `Remove “${NAME.exercise}”` }));
    // The gallery shows every library screen; ones already in the funnel can't be added again.
    await userEvent.click(screen.getByRole("button", { name: "Add screens" }));
    expect(screen.queryByRole("button", { name: `Add “${NAME.goal}”` })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Add “${NAME.language}”` }));
    expect(names()).toEqual([NAME.time, NAME.goal, NAME.language]);

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    // Sent with the state it was loaded at, so a save made elsewhere meanwhile is refused.
    expect(api.saveFunnelDraft).toHaveBeenCalledWith(
      "spring",
      def("time", "goal", "language"),
      "2026-11-02T10:00:00.000Z",
    );
    // The editor re-mounts with the saved state; focus lands on the next step, Publish.
    const publish = await screen.findByRole("button", { name: "Publish to visitors" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveFocus();
    expect(screen.getByText(/Visitors still see version 2/)).toBeInTheDocument();
  });

  it("links to a test run of the saved screens", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal", "time")));
    renderEditor();
    expect(await screen.findByRole("link", { name: "Try it" })).toHaveAttribute(
      "href",
      "/admin/funnels/spring/try",
    );
  });

  it("keeps focus on the move button that was used", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal", "time", "language")));
    renderEditor();
    await screen.findByRole("heading", { name: "Spring" });
    await userEvent.click(screen.getByRole("button", { name: `Move “${NAME.goal}” down` }));
    expect(screen.getByRole("button", { name: `Move “${NAME.goal}” down` })).toHaveFocus();
  });

  it("marks an order that would break the funnel and won't save it", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal", "exercise", "results")));
    renderEditor();
    await screen.findByRole("heading", { name: "Spring" });

    await userEvent.click(screen.getByRole("button", { name: `Move “${NAME.results}” up` }));
    expect(screen.getByText(/Needs the recording screen before it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("publishes saved changes", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal"), def("goal", "time")));
    api.publishFunnel.mockResolvedValue(detail(def("goal", "time"), null, 3));
    renderEditor();

    await userEvent.click(await screen.findByRole("button", { name: "Publish to visitors" }));
    expect(api.publishFunnel).toHaveBeenCalledWith("spring", "2026-11-02T10:00:00.000Z");
    expect(await screen.findByText("No unpublished changes.")).toBeInTheDocument();
    expect(screen.getByText(/visitors see version 3/)).toBeInTheDocument();
  });

  it("asks before discarding saved changes", async () => {
    api.getAdminFunnel.mockResolvedValue(detail(def("goal"), def("goal", "time")));
    api.discardFunnelDraft.mockResolvedValue(
      detail(def("goal"), null, 2, "2026-11-04T10:00:00.000Z"),
    );
    renderEditor();

    await userEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(api.discardFunnelDraft).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Discard" });
    expect(confirm).toHaveFocus();
    await userEvent.click(confirm);
    expect(api.discardFunnelDraft).toHaveBeenCalledWith("spring", "2026-11-02T10:00:00.000Z");
    expect(await screen.findByText("No unpublished changes.")).toBeInTheDocument();
  });

  it("offers to discard a saved draft that no longer passes the checks", async () => {
    api.getAdminFunnel.mockResolvedValue({
      ...detail(def("goal")),
      funnel: { ...detail(def("goal")).funnel, hasDraft: true },
      draftInvalid: true,
    });
    renderEditor();
    expect(await screen.findByText(/no longer pass today’s checks/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish to visitors" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeEnabled();
  });

  it("shows a no-access screen on 403 and a not-found screen on 404", async () => {
    api.getAdminFunnel.mockRejectedValue(new ApiClientError(403, "FORBIDDEN", "Admins only"));
    const { unmount } = renderEditor();
    expect(await screen.findByRole("heading", { name: "This page is for admins" })).toBeVisible();
    unmount();

    api.getAdminFunnel.mockRejectedValue(new ApiClientError(404, "NOT_FOUND", "Funnel not found"));
    renderEditor();
    expect(
      await screen.findByRole("heading", { name: "There’s no funnel at this link" }),
    ).toBeVisible();
  });
});
