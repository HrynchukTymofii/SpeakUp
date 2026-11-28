import type { z } from "zod";
import { DEFAULT_FUNNEL_DEFINITION } from "./funnel-default.js";
import {
  FunnelDefinitionSchema,
  type FunnelStepDef,
  type FunnelStepType,
} from "./funnel-definition.js";

/**
 * The screens the funnel editor can add to a funnel (funnel builder part 4). Screens are code: a
 * developer adds a new one here (and, for a new type, its component in apps/web/funnel/steps).
 * Admins only choose which of them a funnel shows and in what order. Today the library is every
 * screen of the bundled default funnel.
 */
export const FUNNEL_SCREEN_LIBRARY: readonly FunnelStepDef[] = DEFAULT_FUNNEL_DEFINITION.steps;

/** A screen of this type needs a screen of one of `needs` somewhere before it. */
const NEEDS_BEFORE: Partial<Record<FunnelStepType, { needs: FunnelStepType; why: string }[]>> = {
  auth_gate: [{ needs: "recording", why: "sign-up saves the recording made before it" }],
  results: [{ needs: "recording", why: "results show the recording made before it" }],
  paywall: [{ needs: "auth_gate", why: "checkout is tied to the account made at sign-up" }],
};

const TYPE_NAMES: Record<FunnelStepType, string> = {
  single_choice: "question",
  multi_choice: "question",
  slider: "slider",
  reflection: "reflection",
  video_lesson: "mini-lesson",
  mic_permission: "microphone screen",
  recording: "recording screen",
  auth_gate: "sign-up screen",
  results: "results screen",
  loader_with_questions: "plan loader",
  plan_summary: "plan summary",
  paywall: "paywall",
};

/**
 * Orders that pass FunnelDefinitionSchema but break for visitors: a screen that relies on one
 * that hasn't happened yet, or screens after the paywall (nobody gets past it). Indexes are
 * positions in `steps`.
 */
export function funnelFlowIssues(
  steps: readonly FunnelStepDef[],
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  const seen = new Set<FunnelStepType>();
  steps.forEach((step, index) => {
    for (const { needs, why } of NEEDS_BEFORE[step.type] ?? []) {
      if (!seen.has(needs)) {
        issues.push({ index, message: `Needs the ${TYPE_NAMES[needs]} before it: ${why}.` });
      }
    }
    if (step.type === "paywall" && index !== steps.length - 1) {
      issues.push({ index, message: "Must be the last screen: nobody gets past the paywall." });
    }
    seen.add(step.type);
  });
  return issues;
}

/**
 * What the admin editor may save and publish: a valid definition whose screens also run in a
 * working order. Serving stays on FunnelDefinitionSchema, so a stricter rule here never takes a
 * funnel that's already live off the air.
 */
export const EditableFunnelDefinitionSchema = FunnelDefinitionSchema.superRefine(
  ({ steps }, ctx) => {
    for (const { index, message } of funnelFlowIssues(steps)) {
      ctx.addIssue({ code: "custom", path: ["steps", index], message });
    }
  },
);
export type EditableFunnelDefinition = z.infer<typeof EditableFunnelDefinitionSchema>;
