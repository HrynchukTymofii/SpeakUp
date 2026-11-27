import type { FunnelAnswers, FunnelStepDef } from "@speakup/shared";

/**
 * Funnel engine types (SPEC §15.3). A funnel is data: `config.ts` holds a FunnelDefinition
 * (`packages/shared`), and each step `type` maps to one component (`steps/index.tsx`). Adding or
 * reordering steps = editing that data. Nothing here is a function, so a definition can be stored
 * as JSON; dynamic parts are names resolved by `personalize.ts`.
 */

export type AnswerKey = keyof FunnelAnswers;
export type { MultiAnswerKey, SingleAnswerKey, YesNoKey } from "@speakup/shared";

/** What a step can look at to decide whether it applies or how it's worded. */
export interface FunnelContext {
  answers: FunnelAnswers;
  /** Top issue categories from the baseline result (set by the results step). */
  topIssues: string[];
}

/** One step of the definition (FunnelStepSchema). */
export type FunnelStep = FunnelStepDef;

export type StepType = FunnelStep["type"];
