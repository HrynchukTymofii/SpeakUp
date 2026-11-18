import { randomUUID } from "node:crypto";
import type { DbClient } from "@speakup/db";
import {
  AUDIO_EXTENSIONS,
  ErrorCode,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  type AnalysisStage,
  type Attempt,
  type AttemptStatus,
  type AudioMimeType,
  type PresignedUpload,
} from "@speakup/shared";
import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../plugins/error-handler.js";
import type { AnalysisQueue } from "./analysis-queue.js";
import type { Storage } from "./storage.js";

/**
 * The attempt lifecycle shared by signed-in users (/v1/attempts) and the anonymous funnel
 * (/v1/funnel/attempts): create + pre-signed upload → browser uploads to S3 → submit → worker.
 * Routes only decide WHO may do it (ownership, plan, quota, bot check); the mechanics live here.
 */

/**
 * The browser's recorder stops a moment after the timer hits the limit, so the reported
 * duration can be slightly over the maximum. Allow that, reject anything clearly longer.
 */
const DURATION_TOLERANCE_MS = 2_000;

/** Once an attempt has been handed to the worker, a repeated submit just reports its state. */
const SUBMITTED: AttemptStatus[] = ["queued", "processing", "completed"];

/** The columns clients may see (never `audioKey` — storage layout is internal). */
export const attemptSelect = {
  id: true,
  exerciseId: true,
  status: true,
  durationMs: true,
  errorCode: true,
  createdAt: true,
} as const;

export function toApiAttempt(row: {
  id: string;
  exerciseId: string;
  status: AttemptStatus;
  durationMs: number | null;
  errorCode: string | null;
  createdAt: Date;
}): Attempt {
  // Fields listed explicitly (no `...row`): rows loaded with extra columns such as `audioKey`
  // must never leak into a response by accident.
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    status: row.status,
    durationMs: row.durationMs,
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Finer progress than `status`: while processing, an existing transcript means "analyzing". */
export function stageOf(status: AttemptStatus, hasTranscript: boolean): AnalysisStage {
  if (status !== "processing") return status;
  return hasTranscript ? "analyzing" : "transcribing";
}

/** Who owns a new attempt: a signed-in user, or an anonymous funnel session (DB CHECK: one is set). */
export type AttemptOwner = { userId: string } | { funnelSessionId: string };

/**
 * Creates an `awaiting_upload` attempt and the pre-signed upload for it.
 * `keyPrefix` separates storage areas, e.g. `recordings/<userId>` vs `recordings/funnel/<sessionId>`.
 */
export async function createAttemptWithUpload(
  deps: { db: DbClient; storage: Storage },
  input: { owner: AttemptOwner; exerciseId: string; mimeType: AudioMimeType; keyPrefix: string },
): Promise<{ attempt: Attempt; upload: PresignedUpload }> {
  // We pick the id ourselves because the S3 key must contain it before the row exists.
  const id = randomUUID();
  const audioKey = `${input.keyPrefix}/${id}.${AUDIO_EXTENSIONS[input.mimeType]}`;

  // Sign first, insert second: if signing fails, no orphan row is left behind.
  const upload = await deps.storage.createUpload(audioKey, input.mimeType);
  const row = await deps.db.attempt.create({
    data: {
      id,
      ...input.owner,
      exerciseId: input.exerciseId,
      mimeType: input.mimeType,
      audioKey,
    },
    select: attemptSelect,
  });
  return { attempt: toApiAttempt(row), upload };
}

/**
 * Submit after the browser's upload: verify the file in S3, mark queued, enqueue the job.
 * The caller has already checked that the attempt belongs to the requester.
 */
export async function submitAttempt(
  deps: {
    db: DbClient;
    storage: Storage;
    queue: AnalysisQueue;
    log: FastifyBaseLogger;
    /** The HTTP request id, passed to the worker so its logs can be correlated with ours. */
    requestId: string;
  },
  attempt: { id: string; status: AttemptStatus; audioKey: string },
  input: { durationMs: number; maxDurationSec: number },
): Promise<Attempt> {
  const { db, storage, queue } = deps;
  const current = () =>
    db.attempt
      .findUniqueOrThrow({ where: { id: attempt.id }, select: attemptSelect })
      .then(toApiAttempt);

  // Idempotent: a retried submit (e.g. the response got lost) reports the current state
  // instead of failing — and never enqueues a second job.
  if (SUBMITTED.includes(attempt.status)) return current();
  if (attempt.status !== "awaiting_upload") {
    throw new AppError(409, ErrorCode.WRONG_STATE, `Attempt is ${attempt.status}`);
  }

  if (input.durationMs > input.maxDurationSec * 1000 + DURATION_TOLERANCE_MS) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `Recording is longer than ${input.maxDurationSec}s`,
    );
  }

  // Never trust "I uploaded it" from the client: ask S3 (metadata only, no download).
  const size = await storage.getObjectSize(attempt.audioKey);
  if (size === null || size < MIN_UPLOAD_BYTES || size > MAX_UPLOAD_BYTES) {
    throw new AppError(409, ErrorCode.UPLOAD_MISSING, "No valid recording was uploaded");
  }

  // Keep the file: without this, the bucket's lifecycle rule deletes it after 1 day.
  // Done before the state change so a failure here leaves the attempt retryable.
  await storage.markSubmitted(attempt.audioKey);

  // Conditional update = optimistic lock: of two concurrent submits, only one can move
  // the row from awaiting_upload → queued (the other gets count 0 and doesn't enqueue).
  const { count } = await db.attempt.updateMany({
    where: { id: attempt.id, status: "awaiting_upload" },
    data: { status: "queued", durationMs: input.durationMs },
  });

  if (count === 1) {
    try {
      await queue.enqueueAnalysis(attempt.id, deps.requestId);
    } catch (err) {
      // Redis is down: put the attempt back so the client can simply retry the submit,
      // instead of leaving it "queued" forever with no job behind it.
      await db.attempt.updateMany({
        where: { id: attempt.id, status: "queued" },
        data: { status: "awaiting_upload", durationMs: null },
      });
      throw err;
    }
    deps.log.info({ attemptId: attempt.id }, "attempt queued for analysis");
  }

  return current();
}
