import { AnalysisErrorCode } from "@speakup/shared";
import { z } from "zod";
import { PipelineError } from "../errors.js";
import { normalizeWord } from "../metrics/normalize.js";
import type { SttProvider } from "./stt.js";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";
const TIMEOUT_MS = 60_000;

/**
 * Only the parts of Deepgram's response we use. Parsing it with Zod means a changed or broken
 * response fails loudly here, not as `undefined` deep in the metrics code.
 */
const DeepgramResponseSchema = z.object({
  metadata: z.object({ duration: z.number() }),
  results: z.object({
    channels: z
      .array(
        z.object({
          alternatives: z
            .array(
              z.object({
                transcript: z.string(),
                words: z.array(
                  z.object({
                    word: z.string(),
                    start: z.number(),
                    end: z.number(),
                    confidence: z.number(),
                    punctuated_word: z.string().optional(),
                  }),
                ),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
});

/**
 * Deepgram pre-recorded transcription over its REST API (one POST — no SDK needed).
 *
 * Options:
 * - `model=nova-2`, NOT nova-3: on our recordings nova-3 dropped almost every "um"/"uh" even
 *   with filler_words=true (0 of 6 on one test clip), which made fillers invisible to users.
 *   nova-2 keeps them (long "aaa" sounds come out as "uh"). Re-test before moving to a newer model.
 * - `filler_words=true`: keep "um"/"uh" in the transcript. Off by default — Deepgram REMOVES
 *   them, which would make our filler metric always 0.
 * - `punctuate=true` but NOT `smart_format`: smart formatting rewrites "twenty" as "20",
 *   which would show up as a reading mistake when comparing against the reference text.
 */
export function createDeepgramStt(apiKey: string): SttProvider {
  return {
    async transcribe(audioUrl) {
      const params = new URLSearchParams({
        model: "nova-2",
        language: "en",
        punctuate: "true",
        filler_words: "true",
      });

      let res: Response;
      try {
        res = await fetch(`${DEEPGRAM_URL}?${params}`, {
          method: "POST",
          headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: audioUrl }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // Network error / timeout: worth retrying.
        throw new PipelineError(
          AnalysisErrorCode.STT_FAILED,
          `Deepgram request failed: ${(err as Error).message}`,
          true,
        );
      }

      if (!res.ok) {
        // 429 and 5xx are temporary; other 4xx (bad key, unreadable audio) won't fix themselves.
        const retryable = res.status === 429 || res.status >= 500;
        // The body explains the error and contains no secrets; cap it for the logs.
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new PipelineError(
          AnalysisErrorCode.STT_FAILED,
          `Deepgram ${res.status}: ${detail}`,
          retryable,
        );
      }

      const parsed = DeepgramResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new PipelineError(
          AnalysisErrorCode.STT_FAILED,
          "Unexpected Deepgram response shape",
          false,
        );
      }

      const { metadata, results } = parsed.data;
      // Both arrays have .min(1) in the schema, so these exist.
      const best = results.channels[0]?.alternatives[0];
      return {
        provider: "deepgram:nova-2",
        durationSec: metadata.duration,
        text: best?.transcript ?? "",
        words: (best?.words ?? []).map((w) => ({
          word: normalizeWord(w.word),
          punctuated: w.punctuated_word ?? w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
        })),
      };
    },
  };
}
