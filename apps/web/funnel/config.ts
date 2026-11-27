import { DEFAULT_FUNNEL_DEFINITION } from "@speakup/shared";
import type { FunnelStep } from "./types";

/**
 * The SpeakUp web funnel (SPEC §15.2). The steps are data shared with the database seed:
 * DEFAULT_FUNNEL_DEFINITION in packages/shared/src/funnel-default.ts. To add/reorder/remove a
 * step, edit it there. funnel.test.ts runs the full schema on it.
 */
export const FUNNEL_DEFINITION = DEFAULT_FUNNEL_DEFINITION;

export const FUNNEL_STEPS: FunnelStep[] = FUNNEL_DEFINITION.steps;

/** Steps up to and including this one show the progress bar (SPEC: "pre-paywall part"). */
export const PROGRESS_STEP_TYPES = new Set<FunnelStep["type"]>([
  "single_choice",
  "multi_choice",
  "slider",
  "reflection",
  "video_lesson",
  "mic_permission",
  "recording",
  "auth_gate",
  "results",
  "loader_with_questions",
  "plan_summary",
]);

/** No back button here (SPEC §15.2): loaders, and states that can't be "undone". */
export const NO_BACK_STEP_TYPES = new Set<FunnelStep["type"]>([
  "loader_with_questions",
  "auth_gate",
  "results",
]);
