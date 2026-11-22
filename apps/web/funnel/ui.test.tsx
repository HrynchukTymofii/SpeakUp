// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Card, ContinueButton, OptionButton } from "./ui";

describe("Card", () => {
  it("uses the default card surface: white with a shadow, no border (Glow)", () => {
    render(<Card>body</Card>);
    const card = screen.getByText("body");
    expect(card).toHaveClass("bg-card", "shadow-soft-sm");
    expect(card).not.toHaveClass("border");
  });

  it("drops the default surface when the caller passes its own background", () => {
    // Regression: `bg-card` + `bg-butter` on one element → bg-card won, dark text on dark card.
    render(<Card className="bg-butter text-on-pastel">body</Card>);
    const card = screen.getByText("body");
    expect(card).toHaveClass("bg-butter");
    expect(card).not.toHaveClass("bg-card");
  });
});

describe("OptionButton", () => {
  it("reports its state to assistive tech in multi-select mode and calls onClick", async () => {
    const onClick = vi.fn();
    render(<OptionButton label="In meetings" selected multi index={0} onClick={onClick} />);
    const button = screen.getByRole("button", { name: /In meetings/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has no pressed state in single-select mode (tapping moves on)", () => {
    render(<OptionButton label="Yes" selected={false} index={0} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Yes" })).not.toHaveAttribute("aria-pressed");
  });
});

describe("ContinueButton", () => {
  it("can't be pressed while disabled", async () => {
    const onClick = vi.fn();
    render(<ContinueButton onClick={onClick} disabled />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
