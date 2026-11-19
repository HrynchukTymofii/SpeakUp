import type { AttemptSummary } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import {
  completedSlugs,
  levelFor,
  lessonState,
  pathStates,
  streakDays,
  todayCount,
  totalXp,
} from "./progress";

let n = 0;
/** A history row; dates are built in local time so the tests don't depend on the timezone. */
function attempt(
  exerciseSlug: string,
  day: Date,
  { status = "completed", score = 70 }: { status?: AttemptSummary["status"]; score?: number } = {},
): AttemptSummary {
  return {
    id: `a${n++}`,
    exerciseSlug,
    status,
    createdAt: day.toISOString(),
    overallScore: status === "completed" ? score : null,
    subscores: null,
    problems: [],
  };
}
const day = (d: number, h = 12) => new Date(2026, 10, d, h);

describe("completedSlugs", () => {
  it("counts only completed attempts", () => {
    const done = completedSlugs([
      attempt("a", day(1)),
      attempt("b", day(1), { status: "failed" }),
      attempt("c", day(1), { status: "queued" }),
    ]);
    expect([...done]).toEqual(["a"]);
  });
});

describe("lessonState", () => {
  it("is done when every exercise is completed, started when some are", () => {
    const done = new Set(["x-1", "x-2"]);
    expect(lessonState(["x-1", "x-2"], done)).toBe("done");
    expect(lessonState(["x-1", "x-3"], done)).toBe("started");
    expect(lessonState(["x-3"], done)).toBe("new");
    expect(lessonState([], done)).toBe("new");
  });
});

describe("pathStates", () => {
  it("marks done lessons, the first unfinished open lesson as current, and locked ones", () => {
    const states = pathStates([
      { state: "done", locked: false },
      { state: "started", locked: false },
      { state: "new", locked: false },
      { state: "new", locked: true },
    ]);
    expect(states).toEqual(["done", "current", "open", "locked"]);
  });

  it("has no current lesson when everything open is done", () => {
    expect(
      pathStates([
        { state: "done", locked: false },
        { state: "new", locked: true },
      ]),
    ).toEqual(["done", "locked"]);
  });
});

describe("streakDays", () => {
  it("counts consecutive days with a completed attempt, ending today", () => {
    const history = [
      attempt("a", day(19)),
      attempt("b", day(18)),
      attempt("c", day(17)),
      attempt("d", day(15)),
    ];
    expect(streakDays(history, day(19, 20))).toBe(3);
  });

  it("keeps yesterday's streak alive until today is over", () => {
    expect(streakDays([attempt("a", day(18)), attempt("b", day(17))], day(19, 9))).toBe(2);
  });

  it("is 0 when the last practice was before yesterday or nothing completed", () => {
    expect(streakDays([attempt("a", day(16))], day(19))).toBe(0);
    expect(streakDays([attempt("a", day(19), { status: "failed" })], day(19))).toBe(0);
  });
});

describe("todayCount", () => {
  it("counts today's completed recordings", () => {
    const history = [attempt("a", day(19, 8)), attempt("b", day(19, 9)), attempt("c", day(18))];
    expect(todayCount(history, day(19, 22))).toBe(2);
  });
});

describe("XP and levels", () => {
  it("gives 10 XP per completed recording plus a score bonus", () => {
    expect(
      totalXp([attempt("a", day(1), { score: 80 }), attempt("b", day(1), { status: "failed" })]),
    ).toBe(18);
  });

  it("levels up every 100 XP", () => {
    expect(levelFor(0)).toEqual({ level: 1, intoLevel: 0, perLevel: 100 });
    expect(levelFor(250)).toEqual({ level: 3, intoLevel: 50, perLevel: 100 });
  });
});
