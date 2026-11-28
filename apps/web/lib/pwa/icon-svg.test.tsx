import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIconSvg, ICON_SVG_SIZE } from "./icon-svg";
import { parseCssTokens } from "./tokens";

const tokens = parseCssTokens(
  readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8"),
);

/** Where the nested <Mascot> svg sits inside the icon (its 120×120 viewBox scaled to the box). */
function mascotBox(svg: string) {
  const match = svg.match(
    /<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" viewBox="0 0 120 120"/,
  );
  if (!match) throw new Error("no mascot svg in the icon");
  const [x, y, width, height] = match.slice(1).map(Number) as [number, number, number, number];
  return { x, y, width, height };
}

describe("buildIconSvg", () => {
  it("leaves no CSS variables in the icon", () => {
    for (const maskable of [false, true]) {
      const svg = buildIconSvg({ size: 512, maskable, tokens });
      expect(svg).not.toContain("var(");
      expect(svg).toContain(tokens["mascot-mid"]);
    }
  });

  it("fills the whole square with the page colour", () => {
    const svg = buildIconSvg({ size: 192, maskable: false, tokens });
    expect(svg).toContain(`<rect width="192" height="192" fill="${tokens.page}"/>`);
  });

  it("keeps the maskable mascot inside the safe zone", () => {
    const size = 512;
    const box = mascotBox(buildIconSvg({ size, maskable: true, tokens }));
    expect(box.height).toBe(box.width);
    const scale = box.width / 120;
    // The glow circle (cx 60, cy 58, r 58 in the Mascot's viewBox) encloses the whole idle mascot.
    const cx = box.x + 60 * scale;
    const cy = box.y + 58 * scale;
    const r = 58 * scale;
    // Maskable safe zone: a centred circle with a radius of 40% of the icon.
    expect(Math.hypot(cx - size / 2, cy - size / 2) + r).toBeLessThanOrEqual(0.4 * size);
  });

  it("is deterministic", () => {
    expect(buildIconSvg({ size: 180, maskable: false, tokens })).toBe(
      buildIconSvg({ size: 180, maskable: false, tokens }),
    );
  });

  it("committed icon.svg matches the Mascot and tokens", () => {
    const committed = readFileSync(new URL("../../public/icons/icon.svg", import.meta.url), "utf8");
    // Drift guard: if this fails, run `pnpm --filter @speakup/web icons` and commit the result.
    expect(committed).toBe(buildIconSvg({ size: ICON_SVG_SIZE, maskable: false, tokens }));
  });
});
