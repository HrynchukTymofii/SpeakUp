import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AnalysisErrorCode } from "@speakup/shared";
import { z } from "zod";
import { PipelineError } from "../errors.js";
import { SYSTEM_PROMPT } from "./prompt.js";

/**
 * The JSON shape the model must produce. Structured outputs make the API constrain the model's
 * output to this schema. Ranges/lengths (0–100, max 4 issues…) are checked afterwards by the
 * stricter shared `FeedbackSchema`, because the API's schema support doesn't cover every
 * Zod constraint.
 */
const LlmFeedbackSchema = z.object({
  overallScore: z.number(),
  summary: z.string(),
  strengths: z.array(z.string()),
  issues: z.array(
    z.object({
      category: z.enum(["pace", "pauses", "fillers", "clarity", "accuracy", "structure"]),
      severity: z.enum(["low", "medium", "high"]),
      evidence: z.string(),
      tip: z.string(),
    }),
  ),
  nextStep: z.string(),
});

/** The parts of a model response the feedback step needs (keeps tests free of SDK details). */
export interface LlmResponse {
  model: string;
  stopReason: string | null;
  /** The response's text (the JSON document when structured output succeeded). */
  text: string;
  /** Full content, sent back unchanged if we ask the model to fix its answer. */
  content: Anthropic.Beta.BetaContentBlock[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  };
}

export type SendToLlm = (messages: Anthropic.Beta.BetaMessageParam[]) => Promise<LlmResponse>;

/**
 * Claude via the official SDK.
 *
 * - Model from env (`ANTHROPIC_MODEL`, default claude-sonnet-5-5 per SPEC §3).
 * - Structured outputs (`output_config.format`) instead of a forced tool call: current models
 *   reject a forced `tool_choice`, and structured outputs give the same guarantee — the reply is
 *   JSON matching our schema.
 * - `effort: "medium"`: feedback on a short recording doesn't need deep reasoning; this keeps
 *   latency and cost down. (Current models don't accept a custom `temperature`; effort is the knob.)
 * - Prompt caching on the static system prompt.
 * - Server-side fallbacks: if the model declines a request (safety classifier), the API retries it
 *   on a fallback model inside the same call instead of failing the job.
 */
export function createClaudeSender(opts: { apiKey: string; model: string }): SendToLlm {
  // The SDK retries 429/5xx/connection errors twice with backoff by itself.
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: 90_000 });

  return async (messages) => {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: opts.model,
        max_tokens: 16_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(LlmFeedbackSchema) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
      });
    } catch (err) {
      // Typed SDK errors, most specific first: bad request / bad key won't fix themselves.
      if (
        err instanceof Anthropic.BadRequestError ||
        err instanceof Anthropic.AuthenticationError
      ) {
        throw new PipelineError(AnalysisErrorCode.LLM_FAILED, `Claude: ${err.message}`, false);
      }
      if (err instanceof Anthropic.APIError) {
        // 429 / 5xx / connection problems that survived the SDK's own retries → let BullMQ retry later.
        throw new PipelineError(AnalysisErrorCode.LLM_FAILED, `Claude: ${err.message}`, true);
      }
      throw err;
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    return {
      model: response.model,
      stopReason: response.stop_reason,
      text,
      content: response.content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  };
}
