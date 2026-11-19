import { describe, expect, it } from "vitest";
import { drillKind, feedExercises } from "./practice";

const ex = (slug: string) => ({
  id: slug,
  slug,
  type: "free_speech" as const,
  prompt: slug,
  referenceText: null,
  maxDurationSec: 45,
});

describe("drillKind", () => {
  it("names each drill family from its slug", () => {
    expect(drillKind("drill-topic-coffee")).toBe("topic");
    expect(drillKind("drill-questions-ocean")).toBe("questions");
    expect(drillKind("drill-convince-spoon")).toBe("convince");
    expect(drillKind("drill-twister-sea")).toBe("twister");
    expect(drillKind("legend-gettysburg")).toBeNull();
  });
});

describe("feedExercises", () => {
  const all = [
    ex("drill-topic-a"),
    ex("drill-topic-b"),
    ex("drill-questions-a"),
    ex("drill-convince-a"),
    ex("drill-twister-a"),
    ex("legend-x"),
    ex("challenge-your-story"),
  ];

  it("keeps only the quick drills, optionally of one kind", () => {
    expect(
      feedExercises(all, "seed")
        .map((e) => e.slug)
        .sort(),
    ).toEqual([
      "drill-convince-a",
      "drill-questions-a",
      "drill-topic-a",
      "drill-topic-b",
      "drill-twister-a",
    ]);
    expect(
      feedExercises(all, "seed", "topic")
        .map((e) => e.slug)
        .sort(),
    ).toEqual(["drill-topic-a", "drill-topic-b"]);
  });

  it("shuffles the same way for the same seed (stable during a day), differently for another", () => {
    const a = feedExercises(all, "2026-11-19").map((e) => e.slug);
    expect(feedExercises(all, "2026-11-19").map((e) => e.slug)).toEqual(a);
    const others = ["2026-11-20", "2026-11-21", "2026-11-22"].map((s) =>
      feedExercises(all, s)
        .map((e) => e.slug)
        .join(),
    );
    expect(others.some((o) => o !== a.join())).toBe(true);
  });
});
