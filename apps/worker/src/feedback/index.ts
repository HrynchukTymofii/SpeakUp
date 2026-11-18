import type Anthropic from "@anthropic-ai/sdk";
import { AnalysisErrorCode, FeedbackSchema } from "@speakup/shared";
import { z } from "zod";
import { PipelineError } from "../errors.js";
import type { LlmResponse, SendToLlm } from "./claude.js";
import { buildUserMessage, type FeedbackInput } from "./prompt.js";

/**
 * What the model must return: the shown feedback minus the scores we compute ourselves, plus
 * its one judgement call — the content score (null for read-aloud, where content is given).
 */
export const LlmOutputSchema = FeedbackSchema.omit({ overallScore: true, subscores: true }).extend({
  contentScore: z.number().int().min(0).max(100).nullable(),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

export interface FeedbackResult {
  output: LlmOutput;
  model: string;
  /** Summed over every call (a fix-up retry costs tokens too). */
  usage: LlmResponse["usage"];
}

type Check = { ok: true; output: LlmOutput } | { ok: false; problem: string };

/** Turns a model reply into validated Feedback — or a description of what's wrong with it. */
function check(response: LlmResponse): Check {
  if (response.stopReason === "max_tokens") return { ok: false, problem: "the reply was cut off" };
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { ok: false, problem: "the reply was not valid JSON" };
  }
  const parsed = LlmOutputSchema.safeParse(json);
  return parsed.success
    ? { ok: true, output: parsed.data }
    : { ok: false, problem: z.prettifyError(parsed.error) };
}

/**
 * Asks the model for feedback and validates it (SPEC §6.3). If the reply breaks the schema
 * (e.g. 7 issues, content score 120), we show the model its answer plus the validation errors and ask
 * once more; a second failure fails the job with LLM_INVALID_OUTPUT. Retrying more often rarely
 * helps and doubles the cost each time.
 */
export async function generateFeedback(
  send: SendToLlm,
  input: FeedbackInput,
): Promise<FeedbackResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildUserMessage(input) },
  ];
  const usage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  const addUsage = (u: LlmResponse["usage"]) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheWriteTokens += u.cacheWriteTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
  };

  for (let round = 1; round <= 2; round++) {
    const response = await send(messages);
    addUsage(response.usage);

    if (response.stopReason === "refusal") {
      // Even the fallback model declined. Retrying the same input won't change that.
      throw new PipelineError(
        AnalysisErrorCode.LLM_FAILED,
        "The model declined the request",
        false,
      );
    }

    const result = check(response);
    if (result.ok) return { output: result.output, model: response.model, usage };

    // Keep the conversation append-only: the model's own reply (unchanged), then the fix request.
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `Your feedback did not pass validation:\n${result.problem}\nReturn the corrected feedback.`,
    });
  }

  throw new PipelineError(
    AnalysisErrorCode.LLM_INVALID_OUTPUT,
    "Feedback failed validation twice",
    false,
  );
}
