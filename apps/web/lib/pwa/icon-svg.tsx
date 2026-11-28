import { renderToStaticMarkup } from "react-dom/server";
import { Mascot } from "../../components/mascot";
import type { CssTokens } from "./tokens";

/** Size of the committed `public/icons/icon.svg` snapshot (the master the PNGs are drawn from). */
export const ICON_SVG_SIZE = 512;

/** The Mascot's viewBox is 120×120; its glow circle (centre 60,58, r 58) encloses the idle mascot. */
const VIEWBOX = 120;
const GLOW_CY = 58;

/**
 * Share of the icon the Mascot's 120×120 box takes. Maskable icons get cropped to a circle (or
 * squircle) by the launcher, so their glow must fit the safe zone: a centred circle with a radius
 * of 40% of the icon (58/120 × 0.8 ≈ 0.387 ≤ 0.4).
 */
const SCALE_ANY = 1;
const SCALE_MASKABLE = 0.8;

const round = (n: number) => Number(n.toFixed(2));

/**
 * The app icon as a standalone SVG: the idle Mascot on a full-bleed `--page` square, with every
 * `var(--x)` replaced by its value so a rasterizer (which knows no CSS variables) can draw it.
 */
export function buildIconSvg({
  size,
  maskable,
  tokens,
}: {
  size: number;
  maskable: boolean;
  tokens: CssTokens;
}): string {
  const box = size * (maskable ? SCALE_MASKABLE : SCALE_ANY);
  const k = box / VIEWBOX;
  // Centre the glow (not the viewBox) so the mascot sits in the middle of the icon.
  const x = round((size - box) / 2);
  const y = round(size / 2 - GLOW_CY * k);

  const markup = renderToStaticMarkup(<Mascot mood="idle" size={round(box)} />);
  const rootTag = /^<svg viewBox="0 0 120 120" width="[\d.]+" height="[\d.]+"/;
  if (!rootTag.test(markup))
    throw new Error("The Mascot's root <svg> changed; update icon-svg.tsx");

  const mascot = markup
    // Position the Mascot's own <svg> inside the icon.
    .replace(
      rootTag,
      `<svg x="${x}" y="${y}" width="${round(box)}" height="${round(box)}" viewBox="0 0 120 120"`,
    )
    // Drop CSS hooks (animations, Tailwind) that mean nothing in a static image.
    .replace(/ class="[^"]*"/g, "")
    .replace(/ aria-hidden="true"/g, "");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${resolve("page", tokens)}"/>` +
    mascot +
    // No trailing newline: a one-line file has no line endings for git's autocrlf to rewrite on
    // Windows checkouts, so the drift test compares the same bytes everywhere.
    `</svg>`;

  return svg.replace(/var\(--([\w-]+)\)/g, (_, name: string) => resolve(name, tokens));
}

function resolve(name: string, tokens: CssTokens): string {
  const value = tokens[name];
  if (!value) throw new Error(`Icon uses --${name}, which is missing from :root in globals.css`);
  return value;
}
