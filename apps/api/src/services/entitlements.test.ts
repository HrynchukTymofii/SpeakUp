import { describe, expect, it } from "vitest";
import { grantsPro } from "./entitlements.js";
import { startOfUtcDay } from "./usage.js";

const now = new Date("2026-06-15T12:00:00Z");
const future = new Date("2026-07-15T00:00:00Z");
const past = new Date("2026-06-01T00:00:00Z");

describe("grantsPro (SPEC §5 entitlements rule)", () => {
  it.each([
    ["active, period in future", { status: "active", currentPeriodEnd: future }, true],
    ["trialing, period in future", { status: "trialing", currentPeriodEnd: future }, true],
    ["active, no known period end", { status: "active", currentPeriodEnd: null }, true],
    ["active but period ended", { status: "active", currentPeriodEnd: past }, false],
    ["past_due", { status: "past_due", currentPeriodEnd: future }, false],
    ["canceled", { status: "canceled", currentPeriodEnd: future }, false],
  ] as const)("%s → %s", (_label, sub, expected) => {
    expect(grantsPro({ plan: "pro", ...sub }, now)).toBe(expected);
  });

  it("a free-plan subscription never grants Pro", () => {
    expect(grantsPro({ plan: "free", status: "active", currentPeriodEnd: null }, now)).toBe(false);
  });
});

describe("startOfUtcDay", () => {
  it("returns 00:00 UTC of the same UTC day", () => {
    expect(startOfUtcDay(new Date("2026-06-15T23:59:59Z")).toISOString()).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });
});
