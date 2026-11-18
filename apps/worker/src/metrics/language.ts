import type { LanguageMetrics, TranscriptWord } from "@speakup/shared";

/** Words so common that a phrase made only of them ("and it was") isn't a verbal habit. */
const STOP = new Set(
  "the a an and of to in it is i that was for on with at as so but be this my me we you are".split(
    " ",
  ),
);

/**
 * Hedges: phrases that soften a statement until it sounds unsure. Pitch and interview coaches
 * cut these first ("I think we could maybe…" → "We will…").
 */
const HEDGES = [
  "i don't know",
  "kind of",
  "sort of",
  "i guess",
  "i think",
  "i mean",
  "a little bit",
  "maybe",
  "probably",
  "basically",
  "actually",
  "literally",
  "somehow",
].map((h) => h.split(" "));
/** "what kind of", "this sort of" are ordinary grammar, not hedges. */
const KIND_OF_DETERMINERS = new Set(
  "what this that any some every a the same which one these those".split(" "),
);

const MAX_ITEMS = 8;

/**
 * Wording habits counted from the transcript (free speech only — in read-aloud the words are
 * given). Fillers are left out: they have their own metric, and "basically" said as a filler
 * shouldn't count twice.
 */
export function languageMetrics(
  words: TranscriptWord[],
  fillerIndexes: Set<number>,
): LanguageMetrics {
  const tokens = words.flatMap((w, index) =>
    fillerIndexes.has(index) ? [] : [{ w: w.word, index }],
  );
  const at = (k: number) => tokens[k]?.w;

  // Repeated 3-word phrases.
  const counts = new Map<string, number>();
  for (let k = 0; k + 2 < tokens.length; k++) {
    const gram = [at(k), at(k + 1), at(k + 2)] as string[];
    if (gram.every((g) => STOP.has(g))) continue;
    const key = gram.join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeatedPhrases = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ITEMS)
    .map(([phrase, count]) => ({ phrase, count }));

  // Restarts: "I I", "we were we were".
  const restarts: LanguageMetrics["restarts"] = [];
  for (let k = 0; k + 1 < tokens.length; k++) {
    const index = tokens[k]?.index ?? 0;
    if (at(k) === at(k + 1)) {
      restarts.push({ phrase: `${at(k)} ${at(k)}`, wordIndex: index });
      k++;
    } else if (k + 3 < tokens.length && at(k) === at(k + 2) && at(k + 1) === at(k + 3)) {
      restarts.push({ phrase: `${at(k)} ${at(k + 1)} ${at(k)} ${at(k + 1)}`, wordIndex: index });
      k += 3;
    }
  }

  // Hedges (longest match first, so "i don't know" isn't also "i").
  const hedges: LanguageMetrics["hedges"]["list"] = [];
  for (let k = 0; k < tokens.length; k++) {
    const hedge = HEDGES.find((h) => h.every((part, n) => at(k + n) === part));
    if (!hedge) continue;
    const isKindOf = hedge[0] === "kind" || hedge[0] === "sort";
    if (isKindOf && KIND_OF_DETERMINERS.has(at(k - 1) ?? "")) continue;
    hedges.push({ phrase: hedge.join(" "), wordIndex: tokens[k]?.index ?? 0 });
    k += hedge.length - 1;
  }

  return {
    repeatedPhrases,
    restarts: restarts.slice(0, MAX_ITEMS),
    hedges: { count: hedges.length, list: hedges.slice(0, MAX_ITEMS * 2) },
  };
}
