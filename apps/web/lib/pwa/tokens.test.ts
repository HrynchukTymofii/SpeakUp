import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCssTokens, PWA_THEME_COLOR } from "./tokens";

const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("parseCssTokens", () => {
  it("parses the Glow tokens from globals.css", () => {
    const tokens = parseCssTokens(globalsCss);
    expect(tokens.page).toBe("#f7f7fa");
    expect(tokens["mascot-mid"]).toBe("#aeddf7");
    expect(tokens["on-pastel"]).toBe("#0e0e12");
  });

  it("reads only :root and ignores comments", () => {
    const tokens = parseCssTokens(`
      /* --ghost: #000; */
      :root {
        --a: #111; /* trailing note */
        --b:
          0 1px 2px red;
      }
      @theme inline { --a: var(--x); --c: #222; }
    `);
    expect(tokens).toEqual({ a: "#111", b: "0 1px 2px red" });
  });

  it("uses the page token as the theme color", () => {
    expect(PWA_THEME_COLOR).toBe(parseCssTokens(globalsCss).page);
  });
});
