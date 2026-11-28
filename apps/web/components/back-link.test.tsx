// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackLink } from "./back-link";

describe("BackLink", () => {
  it("is a 44 px link named by its text, arrow hidden from screen readers", () => {
    render(<BackLink href="/app">Back to dashboard</BackLink>);
    const link = screen.getByRole("link", { name: "Back to dashboard" });
    expect(link).toHaveAttribute("href", "/app");
    expect(link).toHaveClass("min-h-11");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
