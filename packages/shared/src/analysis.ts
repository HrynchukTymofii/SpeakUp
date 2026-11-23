import { z } from "zod";

/**
 * Contracts for the analysis pipeline (SPEC §6.3). The worker writes these shapes into
 * `Transcript.words`, `Analysis.metrics` and `Analysis.feedback` (Json columns), and the API
 * reads them back — so both sides validate against the same schema.
 *
 * Fields added after launch are `.optional()`: analyses saved before them must still parse.
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

/**
 * Pause thresholds. A silence of PAUSE_MIN_SEC is already audible (a comma is ~0.15–0.4 s), so
 * we count from there. With audio analysis the silence is measured on the waveform; without it,
 * on gaps between STT word timestamps (which are smoothed and miss many short pauses).
 */
export const PAUSE_MIN_SEC = 0.15;
/** A silence in the middle of a phrase this long sounds like searching for words. */
export const HESITATION_PAUSE_SEC = 0.4;
export const LONG_PAUSE_SEC = 1.5;
/** Read-aloud: the pause a listener needs to hear a comma / the end of a sentence. */
export const COMMA_PAUSE_SEC = 0.15;
export const SENTENCE_PAUSE_SEC = 0.3;
/** Speaking longer than this without any pause gives the listener no time to absorb. */
export const RUN_ON_SEC = 12;

/** Below this STT confidence a word is treated as possibly unclear. */
export const LOW_CONFIDENCE = 0.6;

export const PauseSchema = z.object({
  start: z.number(), // when the silence began
  durationSec: z.number(),
  afterWordIndex: z.number().int(), // the pause comes after words[afterWordIndex]
  long: z.boolean(),
  /**
   * boundary = at punctuation (end of a thought: good); phrase = short pause inside a sentence;
   * hesitation = a long mid-phrase silence or one next to a filler (searching for words).
   */
  kind: z.enum(["boundary", "phrase", "hesitation"]).optional(),
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

/** Read-aloud: did the speaker pause where the text has punctuation? */
export const PunctuationMetricsSchema = z.object({
  commas: z.object({ expected: z.number().int(), honored: z.number().int() }),
  sentenceEnds: z.object({ expected: z.number().int(), honored: z.number().int() }),
  /** Spots read straight through: the spoken word the mark follows, and the mark. */
  skipped: z.array(z.object({ word: z.string(), mark: z.string(), wordIndex: z.number().int() })),
});
export type PunctuationMetrics = z.infer<typeof PunctuationMetricsSchema>;

export const TimelinePointSchema = z.object({ t: z.number(), v: z.number() });
export type TimelinePoint = z.infer<typeof TimelinePointSchema>;

/**
 * How the voice is used, measured on the audio (pitch + loudness per word). All values are
 * RELATIVE to the speaker's own voice, so microphone volume and voice depth don't matter.
 */
export const VoiceMetricsSchema = z.object({
  /** False when the recording is too noisy to trust these numbers (the UI hides them). */
  reliable: z.boolean(),
  /** Std. deviation of per-word pitch, in semitones. Low = monotone. */
  pitchVariationSt: z.number(),
  /** Pitch span between the 10th and 90th percentile word, in semitones. */
  pitchRangeSt: z.number(),
  /** Std. deviation of per-word loudness, in dB. Low = no emphasis. */
  loudnessVariationDb: z.number(),
  /**
   * How much the speaking rate changes between phrases (coefficient of variation, %).
   * null when there are too few phrases to compare (a short take).
   */
  paceVariationPct: z.number().nullable(),
  /** Sentences whose last words drop well below the sentence's own volume. */
  trailingOff: z.object({
    count: z.number().int(),
    sentences: z.number().int(),
    list: z.array(z.object({ wordIndex: z.number().int(), dropDb: z.number() })),
  }),
  /** Loudness span between the 10th and 90th percentile word, in dB. */
  loudnessRangeDb: z.number().optional(),
  /**
   * Pitch and loudness over time, for the charts: one point per word (t = word midpoint in
   * seconds). Pitch in semitones and loudness in dB, both relative to the speaker's median.
   */
  timeline: z
    .object({ pitch: z.array(TimelinePointSchema), loudness: z.array(TimelinePointSchema) })
    .optional(),
  /** The most monotone stretch of the take, or null when no stretch is that flat. */
  flattest: z
    .object({ start: z.number(), end: z.number(), pitchVariationSt: z.number() })
    .nullable()
    .optional(),
});
export type VoiceMetrics = z.infer<typeof VoiceMetricsSchema>;

/**
 * Targets for the voice metrics. Starting points from speech research (monotone speakers sit
 * around 1–2 semitones of variation, engaging ones 3+); tune them on real recordings.
 */
export const VOICE_TARGETS = {
  pitchVariationSt: { flat: 1.2, lively: 3 },
  loudnessVariationDb: { flat: 2, lively: 5 },
  paceVariationPct: { flat: 8, lively: 25 },
  /** A sentence "trails off" when its last words are this much quieter than the rest. */
  trailingDropDb: 6,
  /** Pitch variation below this (semitones) sounds monotone: the verdict and the flat stretch. */
  monotoneSt: 1.8,
  /** A monotone stretch is judged over a window at least this long, with at least this many words. */
  stretchMinSec: 4,
  stretchMinWords: 6,
} as const;

/** Wording habits in free speech (counted from the transcript, no LLM). */
export const LanguageMetricsSchema = z.object({
  /** 3-word phrases said more than once ("i want to" ×3). */
  repeatedPhrases: z.array(z.object({ phrase: z.string(), count: z.number().int() })),
  /** Restarts: a word or two said twice in a row ("I I", "we were we were"). */
  restarts: z.array(z.object({ phrase: z.string(), wordIndex: z.number().int() })),
  /** Softening words that make a speaker sound unsure ("kind of", "I guess", "maybe"). */
  hedges: z.object({
    count: z.number().int(),
    list: z.array(z.object({ phrase: z.string(), wordIndex: z.number().int() })),
  }),
});
export type LanguageMetrics = z.infer<typeof LanguageMetricsSchema>;

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
    /** Where the pauses were measured. */
    source: z.enum(["audio", "transcript"]).optional(),
    hesitationCount: z.number().int().optional(),
    /** Longest stretch of speech without any pause, in seconds. */
    longestRunSec: z.number().optional(),
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
  punctuation: PunctuationMetricsSchema.nullable().optional(), // read_aloud only
  voice: VoiceMetricsSchema.nullable().optional(), // null when the audio couldn't be analyzed
  language: LanguageMetricsSchema.nullable().optional(), // free_speech only
});
export type Metrics = z.infer<typeof MetricsSchema>;

export const FeedbackCategorySchema = z.enum([
  "pace",
  "pauses",
  "fillers",
  "clarity",
  "accuracy",
  "structure",
  "voice", // pitch, loudness and pace variety; trailing off
  "content", // relevance, repetition, hedging, specificity
]);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

/** The skills the overall score is built from (computed by our code, not the LLM). */
export const SkillSchema = z.enum(["pace", "pauses", "fillers", "voice", "content", "accuracy"]);
export type Skill = z.infer<typeof SkillSchema>;

/** Max issues in one report: enough to show every real problem, few enough to read. */
export const MAX_ISSUES = 6;

export const FeedbackIssueSchema = z.object({
  category: FeedbackCategorySchema,
  severity: z.enum(["low", "medium", "high"]),
  evidence: z.string().min(1).max(300),
  tip: z.string().min(1).max(300),
});

/** What we store and show (SPEC §6.3). */
export const FeedbackSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(800),
  strengths: z.array(z.string().min(1).max(300)).min(1).max(3),
  issues: z.array(FeedbackIssueSchema).max(MAX_ISSUES),
  nextStep: z.string().min(1).max(300),
  /**
   * Per-skill scores (0–100); the overall score is their weighted mean. Optional: older
   * analyses (where the LLM picked the overall score itself) don't have them.
   */
  subscores: z
    .array(z.object({ skill: SkillSchema, score: z.number().int().min(0).max(100) }))
    .optional(),
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
