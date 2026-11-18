// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Mascot } from "./mascot";

describe("Mascot", () => {
  it("is decorative by default (hidden from screen readers)", () => {
    const { container } = render(<Mascot />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("is announced as an image when it gets a label", () => {
    render(<Mascot label="SpeakUp mascot" />);
    expect(screen.getByRole("img", { name: "SpeakUp mascot" })).toBeInTheDocument();
  });

  it("exposes the mood as a class (the CSS animations key off it) and the size", () => {
    const { container } = render(<Mascot mood="thinking" size={40} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("mascot", "mascot-thinking");
    expect(svg).toHaveAttribute("width", "40");
  });

  it("draws a mood-specific extra: waves when listening, the … bubble when thinking", () => {
    const listening = render(<Mascot mood="listening" />).container;
    expect(listening.querySelectorAll(".mascot-wave")).toHaveLength(2);
    const thinking = render(<Mascot mood="thinking" />).container;
    expect(thinking.querySelectorAll(".mascot-dot")).toHaveLength(3);
  });

  it("gives every instance its own gradient ids, so two mascots on a page don't clash", () => {
    const { container } = render(
      <>
        <Mascot />
        <Mascot />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient")].map((g) => g.id);
    expect(ids).toHaveLength(4); // body + glow, twice
    expect(new Set(ids).size).toBe(4);
    // and the body actually points at its own gradient
    const [first] = container.querySelectorAll(".mascot-morph");
    expect(first?.getAttribute("fill")).toBe(`url(#${ids[0]})`);
  });
});
