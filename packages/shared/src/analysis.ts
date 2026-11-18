import { z } from "zod";

/**
 * Contracts for the analysis pipeline (SPEC §6.3). The worker writes these shapes into
 * `Transcript.words`, `Analysis.metrics` and `Analysis.feedback` (Json columns), and the API
 * reads them back — so both sides validate against the same schema.
 */

/** One recognized word. Times are seconds from the start of the recording. */
export const TranscriptWordSchema = z.object({
  word: z.string(), // normalized, lowercase ("um", "pace")
  punctuated: z.string(), // as displayed ("Pace,")
  start: z.number().min(0),
  end: z.number().min(0),
  confidence: z.number().min(0).max(1),
});
export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const TranscriptSchema = z.object({
  text: z.string(),
  words: z.array(TranscriptWordSchema),
});
export type TranscriptData = z.infer<typeof TranscriptSchema>;

/** Conversational English sweet spot (SPEC §6.3). Shared so the UI draws the same band. */
export const WPM_TARGET = { min: 130, max: 160 } as const;
/** A gap between words longer than this is a pause; longer than LONG is flagged. */
export const PAUSE_MIN_SEC = 0.5;
export const LONG_PAUSE_SEC = 1.5;
/** Below this STT confidence a word is treated as possibly unclear. */
export const LOW_CONFIDENCE = 0.6;

export const PauseSchema = z.object({
  start: z.number(), // when the silence began (end of the previous word)
  durationSec: z.number(),
  afterWordIndex: z.number().int(), // the pause comes after words[afterWordIndex]
  long: z.boolean(),
});
export type Pause = z.infer<typeof PauseSchema>;

export const FillerSchema = z.object({
  word: z.string(),
  start: z.number(),
  wordIndex: z.number().int(),
});

export const ReadAloudMetricsSchema = z.object({
  accuracyPct: z.number().min(0).max(100),
  referenceWordCount: z.number().int(),
  missed: z.array(z.string()),
  substituted: z.array(z.object({ expected: z.string(), said: z.string() })),
  inserted: z.array(z.string()),
});
export type ReadAloudMetrics = z.infer<typeof ReadAloudMetricsSchema>;

export const MetricsSchema = z.object({
  /** Speaking time: first word start → last word end. */
  durationSec: z.number(),
  /** Whole recording, including silence before/after speaking. */
  totalSec: z.number(),
  wordCount: z.number().int(), // excluding fillers
  wpm: z.number(),
  wpmTarget: z.object({ min: z.number(), max: z.number() }),
  pauses: z.object({
    count: z.number().int(),
    longCount: z.number().int(),
    longestSec: z.number(),
    list: z.array(PauseSchema),
  }),
  fillers: z.object({
    count: z.number().int(),
    perMinute: z.number(),
    list: z.array(FillerSchema),
  }),
  lowConfidenceWords: z.array(
    z.object({
      word: z.string(),
      start: z.number(),
      confidence: z.number(),
      wordIndex: z.number().int(),
    }),
  ),
  readAloud: ReadAloudMetricsSchema.nullable(), // null for free_speech
});
export type Metrics = z.infer<typeof MetricsSchema>;

export const FeedbackCategorySchema = z.enum([
  "pace",
  "pauses",
  "fillers",
  "clarity",
  "accuracy",
  "structure",
]);

/** What Claude must return (SPEC §6.3). Validated with Zod even after structured output. */
export const FeedbackSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(800),
  strengths: z.array(z.string().min(1).max(300)).min(1).max(3),
  issues: z
    .array(
      z.object({
        category: FeedbackCategorySchema,
        severity: z.enum(["low", "medium", "high"]),
        evidence: z.string().min(1).max(300),
        tip: z.string().min(1).max(300),
      }),
    )
    .max(4),
  nextStep: z.string().min(1).max(300),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

/**
 * Why an attempt failed (`Attempt.errorCode`). Stable strings — the UI maps them to messages.
 * NO_SPEECH is a user problem (say something!), the others are ours.
 */
export const AnalysisErrorCode = {
  NO_SPEECH: "NO_SPEECH",
  STT_FAILED: "STT_FAILED",
  LLM_INVALID_OUTPUT: "LLM_INVALID_OUTPUT",
  LLM_FAILED: "LLM_FAILED",
  INTERNAL: "INTERNAL",
} as const;
export type AnalysisErrorCode = (typeof AnalysisErrorCode)[keyof typeof AnalysisErrorCode];
