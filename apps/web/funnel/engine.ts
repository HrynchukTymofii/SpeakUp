import { PROGRESS_STEP_TYPES } from "./config";
import type { FunnelContext, FunnelStep } from "./types";

/**
 * Pure navigation rules for the funnel (no React, no storage) — unit-tested in engine.test.ts.
 */

export interface EngineState extends FunnelContext {
  completed: string[];
  attemptId: string | null;
  claimed: boolean;
}

/** The steps that apply to this visitor, in order. */
export function visibleSteps(steps: FunnelStep[], ctx: FunnelContext): FunnelStep[] {
  return steps.filter((step) => step.showIf?.(ctx) ?? true);
}

/** Whether a step's requirement is met, so the visitor may move past it. */
export function isStepDone(step: FunnelStep, state: EngineState): boolean {
  switch (step.type) {
    case "single_choice":
    case "slider":
      return state.answers[step.answerKey] !== undefined;
    case "multi_choice":
      return (state.answers[step.answerKey]?.length ?? 0) > 0;
    case "recording":
      return state.attemptId !== null && state.completed.includes(step.id);
    case "auth_gate":
      return state.claimed;
    case "paywall":
      return false; // the end
    default:
      return state.completed.includes(step.id);
  }
}

/**
 * Guard (SPEC §15.3): the furthest step the visitor may open = the first one not done yet.
 * Opening a later URL directly (e.g. /start/results without a claimed attempt) redirects here.
 */
export function furthestAllowedIndex(steps: FunnelStep[], state: EngineState): number {
  const index = steps.findIndex((step) => !isStepDone(step, state));
  return index === -1 ? steps.length - 1 : index;
}

/** 0..1 across the steps that show the progress bar (everything before the paywall). */
export function progressOf(steps: FunnelStep[], current: FunnelStep): number {
  const tracked = steps.filter((s) => PROGRESS_STEP_TYPES.has(s.type));
  const index = tracked.findIndex((s) => s.id === current.id);
  if (index === -1) return 1;
  return (index + 1) / tracked.length;
}
