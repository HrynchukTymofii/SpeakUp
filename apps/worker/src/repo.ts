import type { DbClient } from "@speakup/db";
import {
  TranscriptWordSchema,
  type AnalysisErrorCode,
  type AttemptStatus,
  type ExerciseType,
  type Feedback,
  type Metrics,
  type TranscriptWord,
} from "@speakup/shared";
import { z } from "zod";

export interface AttemptForAnalysis {
  id: string;
  status: AttemptStatus;
  audioKey: string;
  durationMs: number | null;
  exercise: { type: ExerciseType; prompt: string; referenceText: string | null };
  /** The speaker's goal from onboarding (signed-in user) or the funnel answers (anonymous). */
  goal: string | null;
  /** Saved by an earlier run of this job (e.g. STT worked, then the LLM call failed). */
  transcript: { provider: string; text: string; words: TranscriptWord[] } | null;
}

export interface CompletedAnalysis {
  metrics: Metrics;
  feedback: Feedback;
  llmModel: string;
  promptVersion: string;
  costUsdMicros: number;
  latencyMs: number;
}

/**
 * Everything the pipeline reads/writes in the database. An interface (not Prisma calls inline)
 * so the pipeline can be tested with an in-memory fake.
 */
export interface AnalysisRepo {
  load(attemptId: string): Promise<AttemptForAnalysis | null>;
  markProcessing(attemptId: string): Promise<void>;
  saveTranscript(
    attemptId: string,
    t: { provider: string; text: string; words: TranscriptWord[] },
  ): Promise<void>;
  complete(attemptId: string, analysis: CompletedAnalysis): Promise<void>;
  fail(attemptId: string, code: AnalysisErrorCode): Promise<void>;
}

/** `answers.goal` if it's a string. Answers are free-form JSON, so check instead of trusting. */
function goalFrom(answers: unknown): string | null {
  const parsed = z.object({ goal: z.string().max(200) }).safeParse(answers);
  return parsed.success ? parsed.data.goal : null;
}

export function createPrismaRepo(db: DbClient): AnalysisRepo {
  return {
    async load(attemptId) {
      const row = await db.attempt.findUnique({
        where: { id: attemptId },
        select: {
          id: true,
          status: true,
          audioKey: true,
          durationMs: true,
          exercise: { select: { type: true, prompt: true, referenceText: true } },
          user: { select: { onboarding: true } },
          funnelSession: { select: { answers: true } },
          transcript: { select: { provider: true, text: true, words: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        audioKey: row.audioKey,
        durationMs: row.durationMs,
        exercise: row.exercise,
        goal: goalFrom(row.user?.onboarding) ?? goalFrom(row.funnelSession?.answers),
        transcript: row.transcript && {
          provider: row.transcript.provider,
          text: row.transcript.text,
          // Json column → validate before use (it's a boundary like any other).
          words: z.array(TranscriptWordSchema).parse(row.transcript.words),
        },
      };
    },

    async markProcessing(attemptId) {
      await db.attempt.update({
        where: { id: attemptId },
        data: { status: "processing", errorCode: null },
      });
    },

    async saveTranscript(attemptId, t) {
      // Upsert: a retried job may already have saved one.
      await db.transcript.upsert({
        where: { attemptId },
        create: { attemptId, provider: t.provider, text: t.text, words: t.words },
        update: { provider: t.provider, text: t.text, words: t.words },
      });
    },

    async complete(attemptId, a) {
      // One transaction: the Analysis row and status=completed appear together or not at all.
      // The client polls status, so it must never see "completed" without a result.
      await db.$transaction([
        db.analysis.upsert({
          where: { attemptId },
          create: {
            attemptId,
            metrics: a.metrics,
            feedback: a.feedback,
            overallScore: a.feedback.overallScore,
            llmModel: a.llmModel,
            promptVersion: a.promptVersion,
            costUsdMicros: a.costUsdMicros,
            latencyMs: a.latencyMs,
          },
          update: {},
        }),
        db.attempt.update({
          where: { id: attemptId },
          data: { status: "completed", errorCode: null },
        }),
      ]);
    },

    async fail(attemptId, code) {
      await db.attempt.update({
        where: { id: attemptId },
        data: { status: "failed", errorCode: code },
      });
    },
  };
}
