// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxBreathing } from "./box-breathing";

describe("BoxBreathing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs 4 rounds and calls onDone after 64 s", () => {
    const onDone = vi.fn();
    render(<BoxBreathing onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
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

  it("finish now calls onDone early", () => {
    const onDone = vi.fn();
    render(<BoxBreathing onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: /finish now/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("finish now calls onDone only once", () => {
    const onDone = vi.fn();
    render(<BoxBreathing onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: /finish now/ }));
    act(() => vi.advanceTimersByTime(70_000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
