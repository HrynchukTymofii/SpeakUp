import { z } from "zod";
import { FeedbackSchema, MetricsSchema, TranscriptSchema } from "../analysis.js";
import { ExerciseSchema } from "./courses.js";

/**
 * Audio formats we accept, mapped to the file extension used in the S3 key.
 * - Chrome / Firefox / Edge record `audio/webm` (Opus codec)
 * - Safari records `audio/mp4` (AAC codec)
 * Anything else is rejected: the allowlist keeps junk out of S3 and out of the STT bill.
 */
export const AUDIO_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
} as const;
export type AudioMimeType = keyof typeof AUDIO_EXTENSIONS;

/** Upload size limits enforced by the S3 upload policy AND re-checked on submit (SPEC §6.2). */
export const MIN_UPLOAD_BYTES = 1024; // 1 KB — anything smaller can't contain speech
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — ~10 min of Opus, far above our max

/**
 * `MediaRecorder.mimeType` looks like "audio/webm;codecs=opus". We keep only the base type
 * ("audio/webm"): that's what S3 stores as Content-Type, and the codec is in the file itself.
 */
export const AudioMimeTypeSchema = z
  .string()
  .max(100)
  .transform((value) => (value.split(";")[0] ?? "").trim().toLowerCase())
  .pipe(z.enum(Object.keys(AUDIO_EXTENSIONS) as [AudioMimeType, ...AudioMimeType[]]));

export const AttemptStatusSchema = z.enum([
  "awaiting_upload",
  "queued",
  "processing",
  "completed",
  "failed",
]);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

/** POST /v1/attempts body. The user is never in the body — it comes from the token. */
export const CreateAttemptBodySchema = z.strictObject({
  exerciseId: z.string().min(1).max(64),
  mimeType: AudioMimeTypeSchema,
});
export type CreateAttemptBody = z.input<typeof CreateAttemptBodySchema>;

/**
 * A pre-signed S3 POST: the browser sends a multipart form to `url` with every entry of
 * `fields` first and the file last. The fields carry a signed policy (key, type, size, expiry),
 * so S3 itself rejects anything we didn't authorize — no AWS credentials ever reach the browser.
 */
export const PresignedUploadSchema = z.object({
  url: z.url(),
  fields: z.record(z.string(), z.string()),
  maxBytes: z.number().int(),
  expiresAt: z.iso.datetime(),
});
export type PresignedUpload = z.infer<typeof PresignedUploadSchema>;

/** What clients see of an attempt (status only). The analysis result is a separate object. */
export const AttemptSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  status: AttemptStatusSchema,
  durationMs: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

/** POST /v1/attempts response (201). */
export const CreateAttemptResponseSchema = z.object({
  attempt: AttemptSchema,
  upload: PresignedUploadSchema,
});
export type CreateAttemptResponse = z.infer<typeof CreateAttemptResponseSchema>;

/** POST /v1/attempts/:id/submit body. Duration is measured by the browser's recorder. */
export const SubmitAttemptBodySchema = z.strictObject({
  durationMs: z.number().int().positive(),
});
export type SubmitAttemptBody = z.infer<typeof SubmitAttemptBodySchema>;

/** Response of submit (202) and GET /v1/attempts/:id (200). */
export const AttemptResponseSchema = z.object({ attempt: AttemptSchema });
export type AttemptResponse = z.infer<typeof AttemptResponseSchema>;

/** The finished analysis of a completed attempt. */
export const AttemptResultSchema = z.object({
  overallScore: z.number().int(),
  transcript: TranscriptSchema,
  metrics: MetricsSchema,
  feedback: FeedbackSchema,
});
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

/**
 * GET /v1/attempts/:id — what the results page needs: status (polled until done), the exercise
 * that was practiced, and the result once `status = completed` (null before that or on failure).
 */
/**
 * Finer progress than `status` for the loading screen: while `processing`, whether the
 * transcript already exists tells us if we are still transcribing or already analyzing.
 */
export const AnalysisStageSchema = z.enum([
  "awaiting_upload",
  "queued",
  "transcribing",
  "analyzing",
  "completed",
  "failed",
]);
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>;

export const AttemptDetailResponseSchema = z.object({
  attempt: AttemptSchema,
  stage: AnalysisStageSchema,
  exercise: ExerciseSchema,
  result: AttemptResultSchema.nullable(),
});
export type AttemptDetailResponse = z.infer<typeof AttemptDetailResponseSchema>;
