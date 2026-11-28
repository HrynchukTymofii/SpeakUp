import type { Metadata, Viewport } from "next";
import { describe, expect, it, vi } from "vitest";

// Only the exported metadata matters here; stub what the layouts import for rendering.
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: () => null,
  Show: () => null,
  SignInButton: () => null,
  SignUpButton: () => null,
  UserButton: () => null,
}));
vi.mock("next/font/google", () => ({ Manrope: () => ({ variable: "font-manrope" }) }));
vi.mock("./providers", () => ({ Providers: () => null }));
vi.mock("./globals.css", () => ({}));
vi.mock("@/components/pwa/pwa-setup", () => ({ PwaSetup: () => null }));
vi.mock("@/lib/links", () => ({ appHref: (path: string) => path }));

type LayoutModule = { metadata?: Metadata; viewport?: Viewport };

describe("installability lives only in the product layout", () => {
  it("the (product) layout links the manifest and sets the home-screen tags", async () => {
    const { metadata, viewport } = (await import("./(product)/layout")) as LayoutModule;
    expect(metadata?.manifest).toBe("/speakup.webmanifest");
    expect(metadata?.icons).toMatchObject({ apple: "/icons/apple-touch-icon.png" });
    expect(metadata?.appleWebApp).toMatchObject({ capable: true });
    expect(metadata?.other).toMatchObject({ "apple-mobile-web-app-capable": "yes" });
    expect(viewport?.viewportFit).toBe("cover");
  });

  it.each([
    ["root", () => import("./layout")],
    ["(marketing)", () => import("./(marketing)/layout")],
  ])("the %s layout is not installable", async (_name, load) => {
    const { metadata, viewport } = (await load()) as LayoutModule;
    expect(metadata?.manifest).toBeUndefined();
    expect(metadata?.appleWebApp).toBeUndefined();
    expect(viewport?.viewportFit).toBeUndefined();
  });
});
