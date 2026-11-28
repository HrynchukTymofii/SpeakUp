// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallPlatform } from "@/lib/pwa/install-platform";
import { InstallCard } from "./install-card";

const track = vi.hoisted(() => vi.fn());
const install = vi.hoisted(() => ({
  platform: "manual" as InstallPlatform | null,
  promptInstall: vi.fn(),
}));
vi.mock("@/funnel/analytics", () => ({ track }));
vi.mock("@/lib/pwa/install-events", () => ({ useInstall: () => install }));

beforeEach(() => {
  track.mockReset();
  install.promptInstall.mockReset();
  install.platform = "manual";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const shownEvents = () => track.mock.calls.filter(([event]) => event === "install_prompt_shown");

/** "manual" is provisional for 1.5 s after load: let that pass. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(1500);
  });
}

describe("InstallCard", () => {
  it("renders nothing when running standalone", () => {
    install.platform = "standalone";
    const { container } = render(<InstallCard placement="funnel" />);
    expect(container).toBeEmptyDOMElement();
    expect(track).not.toHaveBeenCalled();
  });

  it("renders nothing until the platform is known (server render)", () => {
    install.platform = null;
    const { container } = render(<InstallCard placement="funnel" />);
    expect(container).toBeEmptyDOMElement();
    expect(track).not.toHaveBeenCalled();
  });

  it("shows Share → Add to Home Screen steps on iOS", () => {
    install.platform = "ios";
    render(<InstallCard placement="landing" />);
    expect(screen.getByRole("heading", { name: "Get SpeakUp on your home screen" })).toBeVisible();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent("Share");
    expect(steps[1]).toHaveTextContent("Add to Home Screen");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("prompts and tracks accepted/dismissed", async () => {
    const user = userEvent.setup();
    install.platform = "prompt";
    install.promptInstall.mockResolvedValueOnce("dismissed").mockResolvedValueOnce("accepted");
    render(<InstallCard placement="purchase" />);

    const button = screen.getByRole("button", { name: "Install the app" });
    await user.click(button);
    expect(track).toHaveBeenCalledWith("install_prompt_dismissed", { placement: "purchase" });

    await user.click(button);
    expect(track).toHaveBeenCalledWith("install_prompt_accepted", { placement: "purchase" });
    expect(install.promptInstall).toHaveBeenCalledTimes(2);
  });

  it("waits for Chrome's late prompt instead of flashing the fallback", () => {
    vi.useFakeTimers();
    install.platform = "manual";
    const { container, rerender } = render(<InstallCard placement="funnel" />);
    // Chrome's prompt often arrives after hydration: nothing shown or tracked until then.
    expect(container).toBeEmptyDOMElement();
    expect(track).not.toHaveBeenCalled();

    install.platform = "prompt";
    rerender(<InstallCard placement="funnel" />);
    expect(screen.getByRole("button", { name: "Install the app" })).toBeVisible();
    settle();
    expect(shownEvents()).toEqual([
      ["install_prompt_shown", { placement: "funnel", platform: "prompt" }],
    ]);
  });

  it("tracks manual once it has settled after page load", () => {
    vi.useFakeTimers();
    install.platform = "manual";
    render(<InstallCard placement="funnel" />);
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.queryByText(/browser's menu/)).not.toBeInTheDocument();
    expect(shownEvents()).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(/browser's menu/)).toBeVisible();
    expect(shownEvents()).toEqual([
      ["install_prompt_shown", { placement: "funnel", platform: "manual" }],
    ]);
  });

  it("starts the grace period only when the page has loaded", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
    install.platform = "manual";
    render(<InstallCard placement="funnel" />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(shownEvents()).toEqual([]);

    act(() => {
      window.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(1500);
    });
    expect(shownEvents()).toEqual([
      ["install_prompt_shown", { placement: "funnel", platform: "manual" }],
    ]);
  });

  it("doesn't log a dismissal when there was no prompt to show", async () => {
    const user = userEvent.setup();
    install.platform = "prompt";
    install.promptInstall.mockResolvedValue("unavailable");
    render(<InstallCard placement="purchase" />);

    await user.click(screen.getByRole("button", { name: "Install the app" }));
    expect(install.promptInstall).toHaveBeenCalledOnce();
    expect(track).not.toHaveBeenCalledWith("install_prompt_dismissed", expect.anything());
    expect(track).not.toHaveBeenCalledWith("install_prompt_accepted", expect.anything());
  });

  it("gives a fallback when the browser can't prompt", () => {
    vi.useFakeTimers();
    install.platform = "manual";
    const { unmount } = render(<InstallCard placement="direct" />);
    settle();
    expect(screen.getByText(/browser's menu/)).toBeVisible();
    expect(screen.getByText(/Install app/)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    install.platform = "in_app_browser";
    render(<InstallCard placement="direct" />);
    expect(screen.getByText(/Open this page in Safari or Chrome/)).toBeVisible();
  });
});
