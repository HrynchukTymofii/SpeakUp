// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "./layout";

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/app" }));

describe("AppLayout", () => {
  it("leaves room for the tab bar and the home indicator under it", async () => {
    // The tab bar grows by the safe-area inset in the installed app, so the page padding must too,
    // or the last row of content hides behind the bar.
    render(await AppLayout({ children: <p>page</p> }));
    const wrapper = screen.getByText("page").parentElement;
    expect(wrapper?.className).toContain("env(safe-area-inset-bottom)");
  });
});
