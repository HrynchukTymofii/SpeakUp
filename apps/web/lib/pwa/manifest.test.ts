import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest, PWA_START_URL } from "./manifest";
import { PWA_THEME_COLOR } from "./tokens";

describe("buildManifest", () => {
  const manifest = buildManifest();

  it("is installable: standalone, start_url inside scope, 192 and 512 icons plus a maskable one", () => {
    expect(manifest.name).toBe("SpeakUp");
    expect(manifest.short_name).toBe("SpeakUp");
    expect(manifest.display).toBe("standalone");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);

    const sizes = manifest.icons.filter((icon) => icon.purpose === "any").map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(manifest.icons.every((icon) => icon.type === "image/png")).toBe(true);
    // The Apple touch icon goes in a <link>, not in the manifest.
    expect(manifest.icons.some((icon) => icon.src.includes("apple"))).toBe(false);
  });

  it("keeps a stable id independent of start_url", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe(PWA_START_URL);
  });

  it("uses the page token as theme color", () => {
    expect(manifest.theme_color).toBe(PWA_THEME_COLOR);
    expect(manifest.background_color).toBe(PWA_THEME_COLOR);
  });

  it("every icon src is a committed file in public/icons", () => {
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^\/icons\//);
      expect(existsSync(new URL(`../../public${icon.src}`, import.meta.url)), icon.src).toBe(true);
    }
  });
});
