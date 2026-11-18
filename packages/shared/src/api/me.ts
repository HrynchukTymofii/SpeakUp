import { z } from "zod";

export const PlanSchema = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Quiz answers: `{ questionId: answer }`. The concrete questions are defined by the funnel
 * config (M5.5), so this is a bounded generic shape rather than one field per question.
 * Limits on key format, value sizes and entry count stop anyone from storing megabytes of
 * junk in our DB through this endpoint.
 */
export const OnboardingAnswerValueSchema = z.union([
  z.string().max(500),
  z.array(z.string().max(200)).max(20), // multi-choice
  z.number().finite(), // slider
  z.boolean(), // yes/no
]);

export const OnboardingAnswersSchema = z
  .record(z.string().regex(/^[a-z0-9-]{1,64}$/, "invalid question id"), OnboardingAnswerValueSchema)
  .refine((answers) => Object.keys(answers).length <= 50, "too many answers");
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

/** PUT /v1/me/onboarding body. `strictObject` rejects unknown fields (SPEC §9). */
export const UpdateOnboardingBodySchema = z.strictObject({
  answers: OnboardingAnswersSchema,
});
export type UpdateOnboardingBody = z.infer<typeof UpdateOnboardingBodySchema>;

/** GET /v1/me response: profile + what the user may do + what they've used today. */
export const MeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    createdAt: z.iso.datetime(),
    onboarding: OnboardingAnswersSchema.nullable(),
  }),
  entitlements: z.object({
    plan: PlanSchema,
    dailyAnalysesLimit: z.number().int(),
  }),
  usage: z.object({
    analysesToday: z.number().int(),
  }),
  /** The latest paid subscription (any status), for the billing page. Null = never subscribed. */
  subscription: z
    .object({
      status: z.enum(["active", "trialing", "past_due", "canceled"]),
      currentPeriodEnd: z.iso.datetime().nullable(),
      /** True if a customer portal is available (we know the provider customer id). */
      manageable: z.boolean(),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
