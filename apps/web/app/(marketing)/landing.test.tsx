// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";

// Links cross to the app host; the real helper needs the full public env.
vi.mock("@/lib/links", () => ({ appHref: (path: string) => `https://app.test${path}` }));

describe("landing page", () => {
  it("sends every main call to action into the speaking check", () => {
    render(<HomePage />);
    const ctas = screen.getAllByRole("link", { name: /take the 2-minute speaking check/i });
    expect(ctas.length).toBeGreaterThanOrEqual(2); // hero + closing card
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "https://app.test/start");
  });

  it("offers returning users their dashboard", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: /go to your dashboard/i })).toHaveAttribute(
      "href",
      "https://app.test/app",
    );
  });

  it("has the sections the header links jump to", () => {
    const { container } = render(<HomePage />);
    for (const id of ["how", "feedback", "lessons"]) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  it("labels the sample score as an example, not a real result", () => {
    render(<HomePage />);
    const feedback = screen.getByRole("region", { name: /feedback you can act on/i });
    expect(within(feedback).getByText(/example result/i)).toBeInTheDocument();
  });
});
