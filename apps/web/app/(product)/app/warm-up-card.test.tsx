// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WarmUpCard } from "./warm-up-card";

describe("WarmUpCard", () => {
  it("links to the warm-up", () => {
    render(<WarmUpCard />);
    expect(screen.getByRole("link", { name: /Pitch coming up/ })).toHaveAttribute(
      "href",
      "/app/warm-up",
    );
  });
});
