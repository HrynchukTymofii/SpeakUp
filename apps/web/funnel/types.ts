import type { FunnelAnswers, FunnelOption } from "@speakup/shared";

/**
 * Funnel engine types (SPEC §15.3). A funnel is data: steps are listed in `config.ts`, and each
 * `type` maps to one component (`steps/index.tsx`). Adding or reordering steps = editing config.
 */

export type AnswerKey = keyof FunnelAnswers;

/** What a step can look at to decide whether it applies or how it's worded. */
export interface FunnelContext {
  answers: FunnelAnswers;
  /** Top issue categories from the baseline result (set by the results step). */
  topIssues: string[];
}

interface BaseStep {
  /** Also the URL segment: /start/<id>. */
  id: string;
  /** Skip the step unless this returns true. */
  showIf?: (ctx: FunnelContext) => boolean;
}

export type SingleAnswerKey = "goal" | "language" | "time" | "deadline" | "focus";
export type MultiAnswerKey = "situations" | "symptoms";
export type YesNoKey = "practice-now" | "reminders";

export type FunnelStep = BaseStep &
  (
    | {
        type: "single_choice";
        answerKey: SingleAnswerKey;
        title: string;
        subtitle?: string;
        options: readonly FunnelOption[] | ((ctx: FunnelContext) => FunnelOption[]);
      }
    | {
        type: "multi_choice";
        answerKey: MultiAnswerKey;
        title: string;
        subtitle?: string;
        options: readonly FunnelOption[];
      }
    | {
        type: "slider";
        answerKey: "self-rating";
        title: string;
        lowLabel: string;
        highLabel: string;
      }
    | {
        type: "reflection";
        /** Personalized wording from earlier answers (funnel/personalize.ts). */
        content: (ctx: FunnelContext) => { title: string; body: string };
      }
    | {
        type: "video_lesson";
        title: string;
        takeaways: string[];
        /** Continue unlocks after this many seconds, or when the video ends. */
        unlockAfterSec: number;
      }
    | { type: "mic_permission" }
    | { type: "recording" }
    | { type: "auth_gate" }
    | { type: "results" }
    | {
        type: "loader_with_questions";
        title: string;
        checklist: string[];
        durationMs: number;
        /** Pauses at `atPct` and asks a yes/no question. */
        questions: { atPct: number; answerKey: YesNoKey; title: string }[];
      }
    | { type: "plan_summary" }
    | { type: "paywall" }
  );

export type StepType = FunnelStep["type"];
