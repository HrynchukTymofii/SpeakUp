import { z } from "zod";
import { FunnelAnswersSchema } from "./funnel.js";

/**
 * A funnel as pure data (SPEC §15.3): a versioned JSON document that can be stored in Postgres
 * and edited without a deploy. Anything that used to be a function in the web config is now a
 * name from a closed list (personalizers, option providers), a declarative rule (`showIf`) or a
 * `{{answer:key}}` template — so a stored definition can never point at arbitrary code.
 * Field names match apps/web/funnel/types.ts.
 */

// ---------- Names ----------

/** Every key of FunnelAnswers. Derived, so a new answer can't be forgotten here. */
export const FunnelAnswerKeySchema = FunnelAnswersSchema.keyof();
export type FunnelAnswerKey = z.infer<typeof FunnelAnswerKeySchema>;

// `.extract` fails to compile if a name isn't a FunnelAnswers key, so these can't drift.
export const SingleAnswerKeySchema = FunnelAnswerKeySchema.extract([
  "goal",
  "language",
  "time",
  "deadline",
  "focus",
]);
export type SingleAnswerKey = z.infer<typeof SingleAnswerKeySchema>;

export const MultiAnswerKeySchema = FunnelAnswerKeySchema.extract(["situations", "symptoms"]);
export type MultiAnswerKey = z.infer<typeof MultiAnswerKeySchema>;

export const YesNoKeySchema = FunnelAnswerKeySchema.extract(["practice-now", "reminders"]);
export type YesNoKey = z.infer<typeof YesNoKeySchema>;

/** Keys holding one value (not a list): what `equals` / `in` rules can compare. */
export const ScalarAnswerKeySchema = FunnelAnswerKeySchema.exclude(MultiAnswerKeySchema.options);
export type ScalarAnswerKey = z.infer<typeof ScalarAnswerKeySchema>;

/** Code-side copy builders a reflection step may name (apps/web/funnel/personalize.ts). */
export const PersonalizerNameSchema = z.enum(["goalReflection", "symptomReflection"]);
export type PersonalizerName = z.infer<typeof PersonalizerNameSchema>;

/** Code-side option lists a single-choice step may name instead of static options. */
export const OptionsProviderNameSchema = z.enum(["focusFromTopIssues"]);
export type OptionsProviderName = z.infer<typeof OptionsProviderNameSchema>;

/** Same pattern as the funnel session's `currentStep`: the id is also the URL segment. */
export const FunnelStepIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

/**
 * Is `value` an answer the funnel can store under `key`? Asks FunnelAnswersSchema itself, so
 * option values and rule values follow FUNNEL_OPTIONS (and the 1–5 self-rating) automatically.
 */
function isAllowedAnswerValue(key: FunnelAnswerKey, value: unknown): boolean {
  const multi = (MultiAnswerKeySchema.options as readonly string[]).includes(key);
  return FunnelAnswersSchema.safeParse({ [key]: multi ? [value] : value }).success;
}

// ---------- Template text ----------

const PLACEHOLDER = /\{\{(.*?)\}\}/g;
const ANSWER_PLACEHOLDER = /^answer:([a-z-]+)(?:\|[^{}|]*)?$/;

/**
 * User-facing copy. It may contain `{{answer:<key>}}` or `{{answer:<key>|fallback}}`, filled in
 * from the user's answers; every other `{{…}}` (or a stray brace pair) is rejected so a typo
 * shows up when saving, not as raw braces on screen.
 */
export const TemplateTextSchema = z
  .string()
  .min(1)
  .max(1000)
  .superRefine((text, ctx) => {
    for (const [, inner = ""] of text.matchAll(PLACEHOLDER)) {
      const key = ANSWER_PLACEHOLDER.exec(inner)?.[1];
      if (!key || !FunnelAnswerKeySchema.safeParse(key).success) {
        ctx.addIssue({ code: "custom", message: `Unknown placeholder {{${inner}}}` });
      }
    }
    const rest = text.replace(PLACEHOLDER, "");
    if (rest.includes("{{") || rest.includes("}}")) {
      ctx.addIssue({ code: "custom", message: "Unmatched {{ or }}" });
    }
  });
export type TemplateText = z.infer<typeof TemplateTextSchema>;

// ---------- Options ----------

/** One answer option. `value` is checked against the step's answer key by the definition. */
export const FunnelOptionSchema = z.strictObject({
  value: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
});

// ---------- Rules ----------

/** Rules nest at most this deep (a bare comparison is depth 1), to keep them readable. */
export const FUNNEL_RULE_MAX_DEPTH = 5;

export type FunnelRule =
  | { answer: ScalarAnswerKey; op: "equals" | "notEquals"; value: string | number }
  | { answer: ScalarAnswerKey; op: "in"; values: (string | number)[] }
  | { answer: MultiAnswerKey; op: "includes"; value: string }
  | { answer: FunnelAnswerKey; op: "answered" | "notAnswered" }
  | { all: FunnelRule[] }
  | { any: FunnelRule[] }
  | { not: FunnelRule };

const RuleValueSchema = z.union([z.string().min(1).max(64), z.number()]);
const RuleListSchema = (): z.ZodType<FunnelRule[]> => z.array(FunnelRuleNodeSchema).min(1).max(20);

const FunnelRuleNodeSchema: z.ZodType<FunnelRule> = z.lazy(() =>
  z.union([
    z.strictObject({
      answer: ScalarAnswerKeySchema,
      op: z.enum(["equals", "notEquals"]),
      value: RuleValueSchema,
    }),
    z.strictObject({
      answer: ScalarAnswerKeySchema,
      op: z.literal("in"),
      values: z.array(RuleValueSchema).min(1).max(20),
    }),
    z.strictObject({
      answer: MultiAnswerKeySchema,
      op: z.literal("includes"),
      value: z.string().min(1).max(64),
    }),
    z.strictObject({ answer: FunnelAnswerKeySchema, op: z.enum(["answered", "notAnswered"]) }),
    z.strictObject({ all: RuleListSchema() }),
    z.strictObject({ any: RuleListSchema() }),
    z.strictObject({ not: FunnelRuleNodeSchema }),
  ]),
);

function ruleDepth(rule: FunnelRule): number {
  if ("all" in rule) return 1 + Math.max(...rule.all.map(ruleDepth));
  if ("any" in rule) return 1 + Math.max(...rule.any.map(ruleDepth));
  if ("not" in rule) return 1 + ruleDepth(rule.not);
  return 1;
}

/** Every value a rule compares against, with the key it is compared under. */
function ruleValues(rule: FunnelRule): { key: FunnelAnswerKey; value: unknown }[] {
  if ("all" in rule) return rule.all.flatMap(ruleValues);
  if ("any" in rule) return rule.any.flatMap(ruleValues);
  if ("not" in rule) return ruleValues(rule.not);
  if ("values" in rule) return rule.values.map((value) => ({ key: rule.answer, value }));
  if ("value" in rule) return [{ key: rule.answer, value: rule.value }];
  return [];
}

/**
 * A declarative condition on the answers (used as `showIf`). Values must be ones the answer can
 * actually hold, so a rule can't silently never match because of a typo.
 */
export const FunnelRuleSchema: z.ZodType<FunnelRule> = FunnelRuleNodeSchema.superRefine(
  (rule, ctx) => {
    if (ruleDepth(rule) > FUNNEL_RULE_MAX_DEPTH) {
      ctx.addIssue({
        code: "custom",
        message: `Rules can nest at most ${FUNNEL_RULE_MAX_DEPTH} levels`,
      });
    }
    for (const { key, value } of ruleValues(rule)) {
      if (!isAllowedAnswerValue(key, value)) {
        ctx.addIssue({ code: "custom", message: `"${String(value)}" is not a ${key} answer` });
      }
    }
  },
);

// ---------- Steps ----------

const base = { id: FunnelStepIdSchema, showIf: FunnelRuleSchema.optional() };
const TextListSchema = z.array(TemplateTextSchema).max(10);

const SingleChoiceStepSchema = z.strictObject({
  ...base,
  type: z.literal("single_choice"),
  answerKey: SingleAnswerKeySchema,
  title: TemplateTextSchema,
  subtitle: TemplateTextSchema.optional(),
  options: z.union([
    z.array(FunnelOptionSchema).min(1).max(20),
    z.strictObject({ provider: OptionsProviderNameSchema }),
  ]),
});

const MultiChoiceStepSchema = z.strictObject({
  ...base,
  type: z.literal("multi_choice"),
  answerKey: MultiAnswerKeySchema,
  title: TemplateTextSchema,
  subtitle: TemplateTextSchema.optional(),
  options: z.array(FunnelOptionSchema).min(1).max(20),
});

const SliderStepSchema = z.strictObject({
  ...base,
  type: z.literal("slider"),
  answerKey: z.literal("self-rating"),
  title: TemplateTextSchema,
  lowLabel: TemplateTextSchema,
  highLabel: TemplateTextSchema,
});

const ReflectionStepSchema = z.strictObject({
  ...base,
  type: z.literal("reflection"),
  content: z.union([
    z.strictObject({ personalizer: PersonalizerNameSchema }),
    z.strictObject({ title: TemplateTextSchema, body: TemplateTextSchema }),
  ]),
});

const VideoLessonStepSchema = z.strictObject({
  ...base,
  type: z.literal("video_lesson"),
  title: TemplateTextSchema,
  takeaways: TextListSchema,
  /** Continue unlocks after this many seconds, or when the video ends. */
  unlockAfterSec: z.number().int().positive(),
});

const LoaderStepSchema = z.strictObject({
  ...base,
  type: z.literal("loader_with_questions"),
  title: TemplateTextSchema,
  checklist: TextListSchema,
  durationMs: z.number().int().positive(),
  /** Pauses at `atPct` and asks a yes/no question. */
  questions: z
    .array(
      z.strictObject({
        atPct: z.number().int().min(1).max(99),
        answerKey: YesNoKeySchema,
        title: TemplateTextSchema,
      }),
    )
    .max(5),
});

/** Steps with no settings of their own: the component does everything. */
const plainStep = <T extends string>(type: T) => z.strictObject({ ...base, type: z.literal(type) });

export const FunnelStepSchema = z.discriminatedUnion("type", [
  SingleChoiceStepSchema,
  MultiChoiceStepSchema,
  SliderStepSchema,
  ReflectionStepSchema,
  VideoLessonStepSchema,
  plainStep("mic_permission"),
  plainStep("recording"),
  plainStep("auth_gate"),
  plainStep("results"),
  LoaderStepSchema,
  plainStep("plan_summary"),
  plainStep("paywall"),
]);
export type FunnelStepDef = z.infer<typeof FunnelStepSchema>;
export type FunnelStepType = FunnelStepDef["type"];

// ---------- Definition ----------

/** Only `focus` options can come from the baseline's top issues. */
const PROVIDER_KEY: Record<OptionsProviderName, SingleAnswerKey> = {
  focusFromTopIssues: "focus",
};

export const FunnelDefinitionSchema = z
  .strictObject({
    version: z.literal(1),
    steps: z.array(FunnelStepSchema).min(1).max(100),
  })
  .superRefine(({ steps }, ctx) => {
    const ids = new Set<string>();
    const collected = new Set<FunnelAnswerKey>();
    const collect = (key: FunnelAnswerKey, path: (string | number)[]) => {
      if (collected.has(key)) {
        ctx.addIssue({ code: "custom", path, message: `"${key}" is already asked earlier` });
      }
      collected.add(key);
    };

    steps.forEach((step, i) => {
      if (ids.has(step.id)) {
        ctx.addIssue({ code: "custom", path: ["steps", i, "id"], message: "Duplicate step id" });
      }
      ids.add(step.id);

      if ("answerKey" in step) collect(step.answerKey, ["steps", i, "answerKey"]);
      if (step.type === "loader_with_questions") {
        step.questions.forEach((q, j) =>
          collect(q.answerKey, ["steps", i, "questions", j, "answerKey"]),
        );
      }

      if (step.type === "single_choice" || step.type === "multi_choice") {
        if (Array.isArray(step.options)) {
          const values = new Set<string>();
          step.options.forEach((option, j) => {
            const path = ["steps", i, "options", j, "value"];
            if (!isAllowedAnswerValue(step.answerKey, option.value)) {
              ctx.addIssue({
                code: "custom",
                path,
                message: `"${option.value}" is not a ${step.answerKey} answer`,
              });
            }
            if (values.has(option.value)) {
              ctx.addIssue({ code: "custom", path, message: "Duplicate option value" });
            }
            values.add(option.value);
          });
        } else if ("provider" in step.options) {
          const wanted = PROVIDER_KEY[step.options.provider];
          if (step.answerKey !== wanted) {
            ctx.addIssue({
              code: "custom",
              path: ["steps", i, "options", "provider"],
              message: `${step.options.provider} only works on "${wanted}"`,
            });
          }
        }
      }
    });
  });
export type FunnelDefinition = z.infer<typeof FunnelDefinitionSchema>;
