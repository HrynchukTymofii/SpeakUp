// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BREATHING_TOTAL_SEC } from "@/learn/breathing";
import { WarmUpView } from "./warm-up-view";

describe("WarmUpView", () => {
  beforeEach(() => {
    // shouldAdvanceTime: without it every user.click hangs under Vitest (see box-breathing.test).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Skip links back to home", () => {
    render(<WarmUpView />);
    expect(screen.getByRole("link", { name: "Skip" })).toHaveAttribute("href", "/app");
  });

  it("after the full exercise shows Done linking home and stores nothing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WarmUpView />);

    await user.click(screen.getByRole("button", { name: /Start/ }));
    act(() => vi.advanceTimersByTime(BREATHING_TOTAL_SEC * 1000));

    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/app");
    // A warm-up is not a lesson: no streak, XP or completion is written.
    expect(localStorage.getItem("speakup.local-done")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
