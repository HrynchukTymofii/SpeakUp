// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "./icons";

describe("Icon", () => {
  it.each<IconName>(["check", "refresh", "arrowLeft"])(
    "draws check, refresh and arrowLeft as aria-hidden line icons (%s)",
    (name) => {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      const d = svg?.querySelector("path")?.getAttribute("d") ?? "";
      expect(d.trim()).not.toBe("");
    },
  );

  it("strokeWidth overrides the default stroke on the path", () => {
    const plain = render(<Icon name="mic" />).container.querySelector("path");
    // Unset: the path carries no width of its own, so the svg's stroke-[1.8] class applies.
    expect(plain).not.toHaveAttribute("stroke-width");

    const thick = render(<Icon name="mic" strokeWidth={2.5} />).container.querySelector("path");
    expect(thick).toHaveAttribute("stroke-width", "2.5");
  });
});
