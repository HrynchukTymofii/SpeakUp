import { describe, expect, it } from "vitest";
import { canAccessLesson } from "./access.js";

describe("canAccessLesson", () => {
  it.each([
    ["free lesson, free plan", true, "free", true],
    ["paid lesson, free plan", false, "free", false],
    ["free lesson, pro plan", true, "pro", true],
    ["paid lesson, pro plan", false, "pro", true],
  ] as const)("%s → %s", (_label, isFree, plan, expected) => {
    expect(canAccessLesson({ isFree }, plan)).toBe(expected);
  });
});
