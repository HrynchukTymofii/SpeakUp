import { FUNNEL_OPTIONS } from "./funnel.js";
import type { FunnelDefinition } from "./funnel-definition.js";

/**
 * The default SpeakUp web funnel (SPEC §15.2) as pure data. It lives here, not in apps/web, so
 * the web app (which renders it on /start and as the fallback for /f/main) and the database seed
 * (which stores it as the `main` funnel) use the same copy. Each step renders by `type` through
 * the component map in apps/web/funnel/steps/index.tsx; dynamic wording and options are names
 * resolved in apps/web/funnel/personalize.ts; `showIf` is a declarative rule.
 *
 * `satisfies` checks the shape at compile time; tests run the full schema (with its cross-field
 * checks), so the web bundle doesn't parse it at runtime.
 */

/** URL slug of the default funnel: /f/main. */
export const DEFAULT_FUNNEL_SLUG = "main";
/** Admin-facing name of the default funnel. */
export const DEFAULT_FUNNEL_NAME = "Main funnel";
/** Content revision of this bundled copy (`Funnel.version`), not the schema format. */
export const DEFAULT_FUNNEL_REVISION = 1;

export const DEFAULT_FUNNEL_DEFINITION = {
  version: 1,
  steps: [
    {
      id: "goal",
      type: "single_choice",
      answerKey: "goal",
      title: "What do you most want to improve?",
      options: [...FUNNEL_OPTIONS.goal],
    },
    {
      id: "situations",
      type: "multi_choice",
      answerKey: "situations",
      title: "When do you feel least confident speaking?",
      subtitle: "Choose all that apply.",
      options: [...FUNNEL_OPTIONS.situations],
    },
    {
      id: "reflection-1",
      type: "reflection",
      content: { personalizer: "goalReflection" },
    },
    {
      id: "language",
      type: "single_choice",
      answerKey: "language",
      title: "Is English your first language?",
      options: [...FUNNEL_OPTIONS.language],
    },
    {
      id: "symptoms",
      type: "multi_choice",
      answerKey: "symptoms",
      title: "What happens when you get nervous speaking?",
      subtitle: "Choose all that apply.",
      options: [...FUNNEL_OPTIONS.symptoms],
    },
    {
      id: "reflection-2",
      type: "reflection",
      content: { personalizer: "symptomReflection" },
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
      options: [...FUNNEL_OPTIONS.time],
    },
    {
      id: "mini-lesson",
      type: "video_lesson",
      title: "How we’ll measure your speaking",
      takeaways: [
        "Pace and pauses — how fast you speak, and where you stop or hesitate",
        "Your voice — whether pitch and volume move, or stay flat",
        "Filler words and wording — “um”, “like”, “I think”, repeated phrases",
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
      options: [...FUNNEL_OPTIONS.deadline],
    },
    {
      id: "focus",
      type: "single_choice",
      answerKey: "focus",
      title: "What should we work on first?",
      subtitle: "Based on your speaking check.",
      options: { provider: "focusFromTopIssues" },
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
  ],
} satisfies FunnelDefinition;
