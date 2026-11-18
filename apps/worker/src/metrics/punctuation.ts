import {
  COMMA_PAUSE_SEC,
  SENTENCE_PAUSE_SEC,
  type Pause,
  type PunctuationMetrics,
  type TranscriptWord,
} from "@speakup/shared";
import { normalizeWord, tokenize } from "./normalize.js";
import { alignWords } from "./read-aloud.js";

type Mark = "," | ".";

/** Reference tokens, each with the punctuation mark that follows it (if any). */
export function referenceTokens(text: string): { token: string; mark: Mark | null }[] {
  const out: { token: string; mark: Mark | null }[] = [];
  for (const chunk of text.split(/\s+/)) {
    const tokens = tokenize(chunk);
    if (tokens.length === 0) continue;
    const trailing = /([,.;:!?…])["'”’)]*$/.exec(chunk)?.[1];
    const mark: Mark | null = !trailing ? null : /[,;:]/.test(trailing) ? "," : ".";
    tokens.forEach((token, i) => out.push({ token, mark: i === tokens.length - 1 ? mark : null }));
  }
  return out;
}

/**
 * Read-aloud: for every comma and sentence end in the reference text, did the reader pause?
 *
 * The reference is aligned to what was said (same alignment as accuracy), so each mark lands
 * on the spoken word it follows. Pauses counted there include any after a filler right behind
 * that word ("ideas, um, and…"). Marks on words the reader skipped aren't judged, and neither is
 * the very last mark (the recording simply ends).
 *
 * Only meaningful with pauses measured on the AUDIO — from STT gaps, most comma pauses are
 * invisible and we'd wrongly report them all as skipped. The caller checks that.
 */
export function punctuationMetrics(
  referenceText: string,
  words: TranscriptWord[],
  fillerIndexes: Set<number>,
  pauses: Pause[],
): PunctuationMetrics {
  const reference = referenceTokens(referenceText);
  // Spoken tokens, each remembering which transcript word it came from.
  const spoken: { token: string; wordIndex: number }[] = [];
  words.forEach((w, wordIndex) => {
    if (fillerIndexes.has(wordIndex)) return;
    for (const token of tokenize(w.word)) spoken.push({ token, wordIndex });
  });
  const ops = alignWords(
    reference.map((r) => r.token),
    spoken.map((s) => s.token),
  );

  const pauseAfter = new Map<number, number>();
  for (const p of pauses) pauseAfter.set(p.afterWordIndex, p.durationSec);
  const lastWordIndex = words.length - 1;

  const result: PunctuationMetrics = {
    commas: { expected: 0, honored: 0 },
    sentenceEnds: { expected: 0, honored: 0 },
    skipped: [],
  };
  for (const op of ops) {
    if (op.kind !== "match" && op.kind !== "sub") continue;
    const mark = reference[op.ref]?.mark;
    const wordIndex = spoken[op.spoken]?.wordIndex;
    if (!mark || wordIndex === undefined || wordIndex >= lastWordIndex) continue;

    // Silence after this word, plus after any fillers that directly follow it.
    let silence = pauseAfter.get(wordIndex) ?? 0;
    for (let k = wordIndex + 1; fillerIndexes.has(k); k++) silence += pauseAfter.get(k) ?? 0;

    const bucket = mark === "," ? result.commas : result.sentenceEnds;
    bucket.expected++;
    if (silence >= (mark === "," ? COMMA_PAUSE_SEC : SENTENCE_PAUSE_SEC)) bucket.honored++;
    else {
      const word = words[wordIndex];
      result.skipped.push({
        word: word ? normalizeWord(word.punctuated) || word.word : "",
        mark,
        wordIndex,
      });
    }
  }
  return result;
}
