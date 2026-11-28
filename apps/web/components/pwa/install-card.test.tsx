// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("tracks install_prompt_shown once with placement and platform", () => {
    install.platform = "manual";
    const { rerender } = render(<InstallCard placement="funnel" />);
    // Chrome's prompt can arrive after the card is on screen: still one impression.
    install.platform = "prompt";
    rerender(<InstallCard placement="funnel" />);
    expect(screen.getByRole("button", { name: "Install the app" })).toBeVisible();
    const shown = track.mock.calls.filter(([event]) => event === "install_prompt_shown");
    expect(shown).toEqual([["install_prompt_shown", { placement: "funnel", platform: "manual" }]]);
  });

  it("gives a fallback when the browser can't prompt", () => {
    install.platform = "manual";
    const { unmount } = render(<InstallCard placement="direct" />);
    expect(screen.getByText(/browser's menu/)).toBeVisible();
    expect(screen.getByText(/Install app/)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    install.platform = "in_app_browser";
    render(<InstallCard placement="direct" />);
    expect(screen.getByText(/Open this page in Safari or Chrome/)).toBeVisible();
  });
});
