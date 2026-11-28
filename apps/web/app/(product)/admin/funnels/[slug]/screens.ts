import type { FunnelStepDef, FunnelStepType } from "@speakup/shared";

/** What each kind of screen is, in the editor's words. */
export const SCREEN_KINDS: Record<FunnelStepType, string> = {
  single_choice: "Question, one answer",
  multi_choice: "Question, several answers",
  slider: "Slider",
  reflection: "Reflection",
  video_lesson: "Mini-lesson video",
  mic_permission: "Microphone",
  recording: "Speaking check",
  auth_gate: "Sign-up",
  results: "Results",
  loader_with_questions: "Plan loader",
  plan_summary: "Plan summary",
  paywall: "Paywall",
};

/** Screens without a title of their own. */
const FIXED_NAMES: Partial<Record<FunnelStepType, string>> = {
  mic_permission: "Allow the microphone",
  recording: "Record the speaking check",
  auth_gate: "Create an account",
  results: "Speaking check results",
  plan_summary: "Your 4-week plan",
  paywall: "Choose a plan",
};

const PERSONALIZER_NAMES = {
  goalReflection: "Reflection on the goal",
  symptomReflection: "Reflection on nerves",
} as const;

/** A screen's name in the list: its title, or what it does when it has none. */
export function screenName(step: FunnelStepDef): string {
  if ("title" in step) return step.title;
  if (step.type === "reflection") {
    return "personalizer" in step.content
      ? PERSONALIZER_NAMES[step.content.personalizer]
      : step.content.title;
  }
  return FIXED_NAMES[step.type] ?? SCREEN_KINDS[step.type];
}
