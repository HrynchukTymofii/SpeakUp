// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OfflinePage, { dynamic, metadata } from "./page";

describe("offline page", () => {
  it("shows the mascot, an offline heading and a Try again link", () => {
    const { container } = render(<OfflinePage />);

    expect(screen.getByRole("heading", { level: 1, name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByText(/needs a connection/)).toBeInTheDocument();
    expect(container.querySelector("svg.mascot-thinking")).toBeInTheDocument();
    // A plain link (no JS, no client router): it reloads the page the visitor asked for.
    const retry = screen.getByRole("link", { name: "Try again" });
    expect(retry.tagName).toBe("A");
    expect(retry).toHaveAttribute("href", "?");
    expect(retry).toHaveClass("btn", "btn-primary");
  });

  it("is built once at build time and kept out of search results", () => {
    expect(dynamic).toBe("force-static");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
