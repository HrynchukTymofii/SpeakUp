import type { ReadAloudMetrics } from "@speakup/shared";
import { round } from "./normalize.js";

/** `ref` / `spoken` are the positions in the two token lists (for mapping back to words). */
export type Op =
  | { kind: "match"; expected: string; ref: number; spoken: number }
  | { kind: "sub"; expected: string; said: string; ref: number; spoken: number }
  | { kind: "missed"; expected: string; ref: number }
  | { kind: "inserted"; said: string; spoken: number };

const SUB = 3; // substitution cost (see below)
const INDEL = 2; // missed or extra word

/**
 * Word-level alignment of what was read against what should have been read, using the
 * classic edit-distance (Levenshtein) table on WORDS instead of characters.
 *
 *   cost[i][j] = cheapest way to turn the first i reference words into the first j spoken words
 *
 * Every step is one of: match (free), substitute, delete (= missed word), insert (= extra word).
 * Walking the table back from the bottom-right corner gives the list of operations.
 *
 * Costs: a substitution (3) is a bit dearer than a missed or extra word (2 each). With plain
 * 1/1/1 costs, "slow DOWN AND pause" read as "slow AND REALLY pause" ties between two
 * substitutions and "missed down + extra really"; humans mean the latter, because "and" was
 * read correctly. Making substitutions dearer keeps exact matches lined up.
 * O(n·m) time and memory — fine for a paragraph (70×80 cells), not for a book.
 */
export function alignWords(reference: string[], spoken: string[]): Op[] {
  const n = reference.length;
  const m = spoken.length;
  // (n+1)×(m+1) table; row 0 / column 0 = aligning against nothing.
  const cost: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j * INDEL : j === 0 ? i * INDEL : 0)),
  );
  const at = (i: number, j: number) => cost[i]?.[j] ?? Infinity;

  for (let i = 1; i <= n; i++) {
    const row = cost[i];
    if (!row) continue;
    for (let j = 1; j <= m; j++) {
      const same = reference[i - 1] === spoken[j - 1];
      row[j] = Math.min(
        at(i - 1, j - 1) + (same ? 0 : SUB), // match / substitute
        at(i - 1, j) + INDEL, // reference word missed
        at(i, j - 1) + INDEL, // extra spoken word
      );
    }
  }

  // Backtrace. On ties prefer match/sub, so "the cat" vs "the bat" is one substitution,
  // not a miss + an insert.
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const expected = reference[i - 1] ?? "";
    const said = spoken[j - 1] ?? "";
    if (i > 0 && j > 0 && at(i, j) === at(i - 1, j - 1) + (expected === said ? 0 : SUB)) {
      const pos = { ref: i - 1, spoken: j - 1 };
      ops.push(
        expected === said
          ? { kind: "match", expected, ...pos }
          : { kind: "sub", expected, said, ...pos },
      );
      i--;
      j--;
    } else if (i > 0 && at(i, j) === at(i - 1, j) + INDEL) {
      ops.push({ kind: "missed", expected, ref: i - 1 });
      i--;
    } else {
      ops.push({ kind: "inserted", said, spoken: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/** Accuracy = share of reference words read correctly. Extra words don't lower it. */
export function readAloudMetrics(reference: string[], spoken: string[]): ReadAloudMetrics {
  const ops = alignWords(reference, spoken);
  const matches = ops.filter((op) => op.kind === "match").length;
  return {
    accuracyPct: reference.length === 0 ? 0 : round((matches / reference.length) * 100, 1),
    referenceWordCount: reference.length,
    missed: ops.flatMap((op) => (op.kind === "missed" ? [op.expected] : [])),
    substituted: ops.flatMap((op) =>
      op.kind === "sub" ? [{ expected: op.expected, said: op.said }] : [],
    ),
    inserted: ops.flatMap((op) => (op.kind === "inserted" ? [op.said] : [])),
  };
}
