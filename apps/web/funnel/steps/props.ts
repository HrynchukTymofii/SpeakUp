import type { FunnelAnswers } from "@speakup/shared";
import type { FunnelContext, FunnelStep, StepType } from "../types";

/** Every step component gets its config entry, the context, and a way to move on. */
export interface StepProps<T extends StepType> {
  step: Extract<FunnelStep, { type: T }>;
  ctx: FunnelContext;
  /** Save `patch` (if any) and go to the next step that applies. */
  onNext: (patch?: FunnelAnswers) => void;
}
