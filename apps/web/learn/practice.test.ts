import { PRACTICE_MODES } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { LEGENDS, MODE_INFO, parseMode, resultsHref, safeNextPath } from "./practice";

describe("practice modes", () => {
  it("has a card for every mode", () => {
    for (const mode of PRACTICE_MODES) expect(MODE_INFO[mode].label, mode).toBeTruthy();
  });

  it("parses a mode from the URL, rejecting anything else", () => {
    expect(parseMode("topic")).toBe("topic");
    expect(parseMode("nope")).toBeUndefined();
  });
});

describe("legends", () => {
  it("each legend is a seeded legend exercise with a video", () => {
    for (const legend of LEGENDS) {
      expect(legend.slug).toMatch(/^legend-/);
      expect(legend.youtubeId).toMatch(/^[\w-]{11}$/);
    }
  });
});

describe("where to go after the results", () => {
  it("keeps in-app paths", () => {
    expect(safeNextPath("/app/practice/topic")).toBe("/app/practice/topic");
    expect(safeNextPath("/app/lessons/pausing?step=4")).toBe("/app/lessons/pausing?step=4");
  });

  it("drops anything that could leave the app (open redirect)", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      "/pricing",
      "/apples",
      null,
    ]) {
      expect(safeNextPath(bad), String(bad)).toBeUndefined();
    }
  });

  it("builds the results link with the way back", () => {
    expect(resultsHref("a1")).toBe("/results/a1");
    expect(resultsHref("a1", "/app/lessons/x?step=3")).toBe(
      "/results/a1?next=%2Fapp%2Flessons%2Fx%3Fstep%3D3",
    );
  });
});
