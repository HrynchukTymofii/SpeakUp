import { z } from "zod";
import { AudioMimeTypeSchema } from "./api/attempts.js";

/**
 * Web funnel contracts (SPEC §15). Answer options live here — not only in the web config — so the
 * API accepts exactly the values the funnel offers (the reference funnel does the same).
 * Labels are user-facing copy; values are stable ids stored in the DB. Never rename a value.
 */
export interface FunnelOption {
  value: string;
  label: string;
}

const opts = <const V extends string>(...pairs: [V, string][]) =>
  pairs.map(([value, label]) => ({ value, label }));

export const FUNNEL_OPTIONS = {
  goal: opts(
    ["job-interviews", "Job interviews"],
    ["pitching", "Pitching (investors, clients, demo day)"],
    ["presentations", "Presentations & public speaking"],
    ["meetings", "Meetings & calls at work"],
    ["conversations", "Everyday conversations"],
    ["clarity", "Clarity & accent"],
  ),
  situations: opts(
    ["meetings", "In meetings"],
    ["calls", "On calls / video"],
    ["groups", "Speaking to a group"],
    ["small-talk", "Small talk with strangers"],
    ["on-the-spot", "When I’m put on the spot"],
  ),
  language: opts(
    ["native", "Yes"],
    ["fluent", "No, I’m fluent"],
    ["intermediate", "No, I’m intermediate"],
    ["learning", "No, I’m still learning"],
  ),
  symptoms: opts(
    ["too-fast", "I talk too fast"],
    ["fillers", "I say “um”, “like”, “you know”"],
    ["lose-thread", "I lose my train of thought"],
    ["quiet", "My voice gets quiet"],
    ["repeat", "People ask me to repeat myself"],
  ),
  time: opts(["5", "5 min"], ["10", "10 min"], ["15", "15 min"], ["20", "20+ min"]),
  deadline: opts(
    ["week", "Within a week"],
    ["month", "Within a month"],
    ["months", "In a few months"],
    ["none", "No, just improving"],
  ),
  // "What should we work on first?" — offered from the result's top issues (+ confidence).
  focus: opts(
    ["pace", "Pace"],
    ["pauses", "Pauses"],
    ["fillers", "Filler words"],
    ["clarity", "Clarity"],
    ["accuracy", "Accuracy"],
    ["structure", "Structure"],
    ["voice", "Energy"],
    ["content", "What I say"],
    ["confidence", "Overall confidence"],
  ),
  yesNo: opts(["yes", "Yes"], ["no", "No"]),
} as const;

/**
 * The funnel's speaking check depends on the goal: answering "tell me about yourself" for an
 * interview is a different skill from a 30-second pitch. Each goal has its own impromptu
 * exercise (`check-<goal>`, seeded in packages/db); unknown or missing goal → `check-general`.
 */
export const GENERAL_SPEAKING_CHECK = "check-general";
export function speakingCheckSlug(goal: string | undefined): string {
  const known = FUNNEL_OPTIONS.goal.some((o) => o.value === goal);
  return known && goal ? `check-${goal}` : GENERAL_SPEAKING_CHECK;
}

type Values<K extends keyof typeof FUNNEL_OPTIONS> = (typeof FUNNEL_OPTIONS)[K][number]["value"];
const oneOf = <K extends keyof typeof FUNNEL_OPTIONS>(key: K) =>
  z.enum(FUNNEL_OPTIONS[key].map((o) => o.value) as [Values<K>, ...Values<K>[]]);

/**
 * Every answer the funnel collects, keyed by step id. All optional (answers arrive one step at
 * a time). Strict: unknown keys are rejected. The keys/values also satisfy
 * `OnboardingAnswersSchema`, because on claim they are copied into `User.onboarding`.
 */
export const FunnelAnswersSchema = z.strictObject({
  goal: oneOf("goal").optional(),
  situations: z.array(oneOf("situations")).max(5).optional(),
  language: oneOf("language").optional(),
  symptoms: z.array(oneOf("symptoms")).max(5).optional(),
  "self-rating": z.number().int().min(1).max(5).optional(),
  time: oneOf("time").optional(),
  deadline: oneOf("deadline").optional(),
  focus: oneOf("focus").optional(),
  "practice-now": oneOf("yesNo").optional(),
  reminders: oneOf("yesNo").optional(),
});
export type FunnelAnswers = z.infer<typeof FunnelAnswersSchema>;

/** Max length of an anonymous baseline recording (SPEC §9). */
export const FUNNEL_MAX_RECORDING_SEC = 45;

/** POST /v1/funnel/sessions → the guest token, shown ONCE (the server keeps only its hash). */
export const CreateFunnelSessionResponseSchema = z.object({ token: z.string() });
export type CreateFunnelSessionResponse = z.infer<typeof CreateFunnelSessionResponseSchema>;

/** PATCH /v1/funnel/sessions/current — answers are merged into what's stored. */
export const UpdateFunnelSessionBodySchema = z.strictObject({
  answers: FunnelAnswersSchema,
  currentStep: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
});
export type UpdateFunnelSessionBody = z.infer<typeof UpdateFunnelSessionBodySchema>;

/** POST /v1/funnel/attempts — the anonymous baseline. Turnstile proves a human is recording. */
export const CreateFunnelAttemptBodySchema = z.strictObject({
  mimeType: AudioMimeTypeSchema,
  turnstileToken: z.string().min(1).max(2048),
});
export type CreateFunnelAttemptBody = z.input<typeof CreateFunnelAttemptBodySchema>;

/** GET /v1/funnel/attempts/:id — progress only. The result is shown only after the claim. */
export const FunnelAttemptStatusResponseSchema = z.object({
  attempt: z.object({
    id: z.string(),
    status: z.enum(["awaiting_upload", "queued", "processing", "completed", "failed"]),
    stage: z.enum([
      "awaiting_upload",
      "queued",
      "transcribing",
      "analyzing",
      "completed",
      "failed",
    ]),
  }),
});
export type FunnelAttemptStatusResponse = z.infer<typeof FunnelAttemptStatusResponseSchema>;

/**
 * POST /v1/funnel/claim (Clerk JWT in Authorization). The guest token goes in the BODY because
 * the Authorization header already carries the Clerk token.
 */
export const ClaimFunnelBodySchema = z.strictObject({ guestToken: z.string().min(1).max(200) });
export type ClaimFunnelBody = z.infer<typeof ClaimFunnelBodySchema>;

export const ClaimFunnelResponseSchema = z.object({
  /** The baseline attempt now owned by the user (null if they never recorded one). */
  attemptId: z.string().nullable(),
});
export type ClaimFunnelResponse = z.infer<typeof ClaimFunnelResponseSchema>;
