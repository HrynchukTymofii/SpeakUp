// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BREATHING_TOTAL_SEC } from "@/learn/breathing";
import { WarmUpView } from "./warm-up-view";

describe("WarmUpView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Skip links back to home", () => {
    render(<WarmUpView />);
    expect(screen.getByRole("link", { name: "Skip" })).toHaveAttribute("href", "/app");
  });

  it("after the full exercise shows Done linking home and stores nothing", () => {
    render(<WarmUpView />);

    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    act(() => vi.advanceTimersByTime(BREATHING_TOTAL_SEC * 1000));

    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/app");
    // The breathing card's live region is gone, so the end must be announced from here.
    expect(screen.getByRole("status")).toHaveTextContent("You’re ready. Go get them.");
    // A warm-up is not a lesson: no streak, XP or completion is written.
    expect(localStorage.getItem("speakup.local-done")).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
