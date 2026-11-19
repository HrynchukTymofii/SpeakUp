import { describe, expect, it } from "vitest";
import { splitLessonBody } from "./lesson-steps";

describe("splitLessonBody", () => {
  it("turns each ## section into a step with its title and markdown", () => {
    const steps = splitLessonBody("## Why it matters\n\nBecause.\n\n## Example\n\nLike this.\n");
    expect(steps).toEqual([
      { title: "Why it matters", body: "Because." },
      { title: "Example", body: "Like this." },
    ]);
  });

  it("keeps text before the first heading as an untitled intro", () => {
    expect(splitLessonBody("Intro text\n\n## Try this\n\n- a")).toEqual([
      { title: "", body: "Intro text" },
      { title: "Try this", body: "- a" },
    ]);
  });

  it("returns one step for a body without headings, and none for an empty body", () => {
    expect(splitLessonBody("Just text")).toEqual([{ title: "", body: "Just text" }]);
    expect(splitLessonBody("  ")).toEqual([]);
  });
});
