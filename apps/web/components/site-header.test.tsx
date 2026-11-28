// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("stays clear of the notch and the rounded corners in the installed app", () => {
    // With viewport-fit=cover the bar is drawn under the status bar, and in landscape the notch
    // covers the left or right edge. On the marketing host (no cover) these insets are 0.
    render(
      <SiteHeader homeHref="/">
        <button type="button">Sign in</button>
      </SiteHeader>,
    );
    const header = screen.getByRole("banner");
    expect(header.className).toContain("env(safe-area-inset-top)");
    const row = screen.getByRole("navigation").parentElement;
    expect(row?.className).toContain("env(safe-area-inset-left)");
    expect(row?.className).toContain("env(safe-area-inset-right)");
  });
});
