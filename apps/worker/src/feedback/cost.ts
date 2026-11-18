/**
 * Estimated cost of one analysis in micro-USD (1 USD = 1_000_000), saved on every Analysis row.
 * Integers avoid floating-point drift when summing millions of rows.
 *
 * Prices come from env (SPEC §10), because providers change prices and we don't want a deploy
 * for that. Cache pricing follows Anthropic's multipliers: writing to the cache costs 1.25× the
 * input price, reading from it 0.1×.
 */
export interface Prices {
  sttUsdPerMin: number;
  llmInputUsdPerMTok: number;
  llmOutputUsdPerMTok: number;
}

export function estimateCostUsdMicros(
  prices: Prices,
  sttSeconds: number,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  },
): number {
  const stt = (sttSeconds / 60) * prices.sttUsdPerMin;
  const inputEquivalent =
    usage.inputTokens + usage.cacheWriteTokens * 1.25 + usage.cacheReadTokens * 0.1;
  const llm =
    (inputEquivalent / 1_000_000) * prices.llmInputUsdPerMTok +
    (usage.outputTokens / 1_000_000) * prices.llmOutputUsdPerMTok;
  return Math.round((stt + llm) * 1_000_000);
}
