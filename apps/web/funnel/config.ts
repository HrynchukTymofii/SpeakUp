import { FUNNEL_OPTIONS } from "@speakup/shared";
import { focusOptions, goalReflection, symptomReflection } from "./personalize";
import type { FunnelStep } from "./types";

/**
 * The SpeakUp web funnel (SPEC §15.2), in order. Each entry renders by `type` through the
 * component map in `steps/index.tsx`. To add/reorder/remove a step, edit this array only.
 */
export const FUNNEL_STEPS: FunnelStep[] = [
  {
    id: "goal",
    type: "single_choice",
    answerKey: "goal",
    title: "What do you most want to improve?",
    options: FUNNEL_OPTIONS.goal,
  },
  {
    id: "situations",
    type: "multi_choice",
    answerKey: "situations",
    title: "When do you feel least confident speaking?",
    subtitle: "Choose all that apply.",
    options: FUNNEL_OPTIONS.situations,
  },
  {
    id: "reflection-1",
    type: "reflection",
    content: ({ answers }) => goalReflection(answers),
  },
  {
    id: "language",
    type: "single_choice",
    answerKey: "language",
    title: "Is English your first language?",
    options: FUNNEL_OPTIONS.language,
  },
  {
    id: "symptoms",
    type: "multi_choice",
    answerKey: "symptoms",
    title: "What happens when you get nervous speaking?",
    subtitle: "Choose all that apply.",
    options: FUNNEL_OPTIONS.symptoms,
  },
  {
    id: "reflection-2",
    type: "reflection",
    content: ({ answers }) => symptomReflection(answers),
  },
  {
    id: "self-rating",
    type: "slider",
    answerKey: "self-rating",
    title: "How would you rate your speaking confidence today?",
    lowLabel: "Not confident",
    highLabel: "Very confident",
  },
  {
    id: "time",
    type: "single_choice",
    answerKey: "time",
    title: "How much time can you practice per day?",
    options: FUNNEL_OPTIONS.time,
  },
  {
    id: "mini-lesson",
    type: "video_lesson",
    title: "How we’ll measure your speaking",
    takeaways: [
      "Pace — how many words per minute you speak",
      "Pauses — where you stop, and for how long",
      "Filler words and clarity — “um”, “uh”, and words that get lost",
    ],
    unlockAfterSec: 10,
  },
  { id: "mic", type: "mic_permission" },
  { id: "exercise", type: "recording" },
  { id: "auth", type: "auth_gate" },
  { id: "results", type: "results" },
  {
    id: "deadline",
    type: "single_choice",
    answerKey: "deadline",
    title: "Do you have an important speaking moment coming up?",
    options: FUNNEL_OPTIONS.deadline,
  },
  {
    id: "focus",
    type: "single_choice",
    answerKey: "focus",
    title: "What should we work on first?",
    subtitle: "Based on your speaking check.",
    options: ({ topIssues }) => focusOptions(topIssues),
  },
  {
    id: "plan-loader",
    type: "loader_with_questions",
    title: "Building your personal plan",
    checklist: [
      "Analyzing your recording",
      "Matching lessons to your goal",
      "Setting your daily practice",
    ],
    durationMs: 12_000,
    questions: [
      { atPct: 30, answerKey: "practice-now", title: "Do you practice speaking out loud now?" },
      {
        atPct: 65,
        answerKey: "reminders",
        title: "Would daily reminders help you stay consistent?",
      },
    ],
  },
  { id: "plan", type: "plan_summary" },
  { id: "paywall", type: "paywall" },
];

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
