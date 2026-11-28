import { describe, expect, it } from "vitest";
import { DEFAULT_FUNNEL_DEFINITION } from "./funnel-default.js";
import type { FunnelStepDef } from "./funnel-definition.js";
import {
  EditableFunnelDefinitionSchema,
  FUNNEL_SCREEN_LIBRARY,
  funnelFlowIssues,
} from "./funnel-screens.js";

const screen = (id: string) => {
  const found = FUNNEL_SCREEN_LIBRARY.find((s) => s.id === id);
  if (!found) throw new Error(`no screen ${id}`);
  return found;
};
const order = (...ids: string[]): FunnelStepDef[] => ids.map(screen);

describe("FUNNEL_SCREEN_LIBRARY", () => {
  it("has unique ids, so a screen can be added to a funnel at most once", () => {
    const ids = FUNNEL_SCREEN_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("funnelFlowIssues", () => {
  it("accepts the default funnel and a short one without the live screens", () => {
    expect(funnelFlowIssues(DEFAULT_FUNNEL_DEFINITION.steps)).toEqual([]);
    expect(funnelFlowIssues(order("goal", "reflection-1", "time"))).toEqual([]);
  });

  it("needs a recording before sign-up and results", () => {
    expect(funnelFlowIssues(order("goal", "auth", "results", "exercise"))).toEqual([
      { index: 1, message: expect.stringContaining("recording screen") },
      { index: 2, message: expect.stringContaining("recording screen") },
    ]);
  });

  it("needs sign-up before the paywall, and the paywall last", () => {
    expect(funnelFlowIssues(order("exercise", "paywall", "auth"))).toEqual([
      { index: 1, message: expect.stringContaining("sign-up screen") },
      { index: 1, message: expect.stringContaining("last screen") },
    ]);
  });
});

describe("EditableFunnelDefinitionSchema", () => {
  it("reports flow problems on the screen's path, next to schema problems", () => {
    const result = EditableFunnelDefinitionSchema.safeParse({
      version: 1,
      steps: order("results", "goal"),
    });
    expect(result.error?.issues.map((i) => i.path)).toEqual([["steps", 0]]);
  });

  it("accepts the default funnel", () => {
    expect(EditableFunnelDefinitionSchema.safeParse(DEFAULT_FUNNEL_DEFINITION).success).toBe(true);
  });
});
