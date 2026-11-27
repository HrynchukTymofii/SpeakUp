import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner's rule (2026-11-22): no emoji anywhere in the web UI — use the line icons in
 * components/icons.tsx (or an image) instead. This scans the UI source so one can't slip back in.
 * Text symbols such as × and arrows are not emoji, so they pass here. ✓ and ↻ are not emoji
 * either, but they are banned as stand-in icons by `no-glyph-icons.test.ts`.
 */
const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "funnel", "learn", "lib"];
const EMOJI = /\p{Extended_Pictographic}/u;
const TEXT_SYMBOLS = new Set(["✓", "×", "©", "®", "™", "↗", "→", "←"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("web UI source", () => {
  it("uses icons, not emoji", () => {
    const hits: string[] = [];
    for (const file of DIRS.flatMap((d) => sourceFiles(join(ROOT, d)))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const char of line) {
            if (EMOJI.test(char) && !TEXT_SYMBOLS.has(char)) {
              hits.push(`${relative(ROOT, file)}:${i + 1} ${char}`);
            }
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
