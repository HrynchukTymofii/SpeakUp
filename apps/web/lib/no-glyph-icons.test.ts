import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ✓ and ↻ are not emoji, so `no-emoji.test.ts` lets them through, but used as a badge, bullet or
 * button mark they render in whatever the system font draws, thin and off-centre next to the line
 * icons. Use `<Icon name="check" />` / `<Icon name="refresh" />` from components/icons.tsx instead,
 * and keep the glyphs out of copy too. × and arrows inside sentences stay allowed typography.
 */
const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "funnel", "learn", "lib"];
const GLYPHS = ["✓", "↻"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("web UI source", () => {
  it("uses line icons, not ✓ or ↻ glyphs", () => {
    const hits: string[] = [];
    for (const file of DIRS.flatMap((d) => sourceFiles(join(ROOT, d)))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const glyph of GLYPHS) {
            if (line.includes(glyph)) hits.push(`${relative(ROOT, file)}:${i + 1} ${glyph}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
