/**
 * Generates the app icons (public/icons) from the Mascot and the theme tokens in globals.css:
 *   pnpm --filter @speakup/web icons
 * Re-run it after changing the Mascot or the Glow tokens and commit the result; a test fails while
 * the committed icon.svg is out of date. The output is deterministic (same input → same bytes).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { buildIconSvg, ICON_SVG_SIZE } from "../lib/pwa/icon-svg";
import { PWA_ICONS } from "../lib/pwa/icons";
import { parseCssTokens } from "../lib/pwa/tokens";

const appDir = new URL("../", import.meta.url);
const outDir = new URL("public/icons/", appDir);

async function rasterize(svg: string, size: number): Promise<Buffer> {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img>, not next/image
  const image = new ImageResponse(<img src={src} width={size} height={size} alt="" />, {
    width: size,
    height: size,
  });
  return Buffer.from(await image.arrayBuffer());
}

async function main() {
  const tokens = parseCssTokens(readFileSync(new URL("app/globals.css", appDir), "utf8"));
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    new URL("icon.svg", outDir),
    buildIconSvg({ size: ICON_SVG_SIZE, maskable: false, tokens }),
  );
  for (const icon of PWA_ICONS) {
    const svg = buildIconSvg({ size: icon.size, maskable: icon.purpose === "maskable", tokens });
    writeFileSync(new URL(icon.file, outDir), await rasterize(svg, icon.size));
    console.log(`wrote public/icons/${icon.file} (${icon.size}×${icon.size})`);
  }
}

await main();
