// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxBreathing } from "./box-breathing";

describe("BoxBreathing", () => {
  beforeEach(() => {
    // shouldAdvanceTime: Testing Library's async wrapper awaits a real setTimeout(0) that it only
    // flushes under Jest's fake timers, so without it every user.click hangs under Vitest.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs 4 rounds and calls onDone after 64 s", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDone = vi.fn();
    render(<BoxBreathing onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: /Start/ }));
    expect(screen.getByText("Breathe in")).toBeInTheDocument();
    expect(screen.getByText("Round 1 of 4")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText("Hold")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(59_000)); // 63 s in
    expect(screen.getByText("Round 4 of 4")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000)); // 64 s in
    expect(onDone).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(10_000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("finish now calls onDone early", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDone = vi.fn();
    render(<BoxBreathing onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: /Start/ }));
    act(() => vi.advanceTimersByTime(5000));
    await user.click(screen.getByRole("button", { name: /finish now/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
