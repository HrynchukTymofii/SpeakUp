import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PWA_ICONS } from "./icons";

/** Width and height from a PNG's IHDR chunk (bytes 16–23, big-endian). */
function pngSize(file: string) {
  const bytes = readFileSync(new URL(`../../public/icons/${file}`, import.meta.url));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("PWA_ICONS", () => {
  it("lists the 192 and 512 icons, a maskable one and the Apple touch icon", () => {
    expect(PWA_ICONS.map((icon) => [icon.file, icon.size, icon.purpose])).toEqual([
      ["icon-192.png", 192, "any"],
      ["icon-512.png", 512, "any"],
      ["icon-maskable-512.png", 512, "maskable"],
      ["apple-touch-icon.png", 180, "apple"],
    ]);
  });

  it("every committed PNG has the size the table says", () => {
    for (const icon of PWA_ICONS) {
      expect(pngSize(icon.file), icon.file).toEqual({ width: icon.size, height: icon.size });
    }
  });
});
