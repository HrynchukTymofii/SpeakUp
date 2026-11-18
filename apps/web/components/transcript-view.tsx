import type { Metrics, TranscriptWord } from "@speakup/shared";

/**
 * The transcript with problems marked in place: filler words highlighted, long pauses shown
 * as markers, and words the recognizer was unsure about underlined.
 * Everything is derived from the metrics (word indexes), so the UI never re-implements the
 * detection rules — it only displays what the worker measured.
 */
export function TranscriptView({ words, metrics }: { words: TranscriptWord[]; metrics: Metrics }) {
  const fillerIndexes = new Set<number>();
  for (const f of metrics.fillers.list) {
    fillerIndexes.add(f.wordIndex);
    if (f.word.includes(" ")) fillerIndexes.add(f.wordIndex + 1); // "you know" spans 2 words
  }
  const longPauseAfter = new Map(
    metrics.pauses.list.filter((p) => p.long).map((p) => [p.afterWordIndex, p.durationSec]),
  );
  const unclearIndexes = new Set(metrics.lowConfidenceWords.map((w) => w.wordIndex));

  if (words.length === 0) return <p className="text-slate-500">No words were recognized.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="leading-loose text-slate-800">
        {words.map((w, i) => {
          const pause = longPauseAfter.get(i);
          const isFiller = fillerIndexes.has(i);
          const isUnclear = unclearIndexes.has(i);
          return (
            <span key={i}>
              <span
                className={
                  isFiller
                    ? "rounded bg-amber-100 px-0.5 text-amber-900"
                    : isUnclear
                      ? "underline decoration-slate-400 decoration-dotted underline-offset-4"
                      : undefined
                }
                title={isFiller ? "Filler word" : isUnclear ? "Possibly unclear" : undefined}
              >
                {w.punctuated}
              </span>
              {pause !== undefined && (
                <span className="mx-1 rounded bg-sky-100 px-1 text-xs text-sky-900">
                  pause {pause.toFixed(1)}s
                </span>
              )}{" "}
            </span>
          );
        })}
      </p>
      <p className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span>
          <span className="rounded bg-amber-100 px-1 text-amber-900">um</span> filler word
        </span>
        <span>
          <span className="rounded bg-sky-100 px-1 text-sky-900">pause</span> long pause (over 1.5
          s)
        </span>
        <span>
          <span className="underline decoration-dotted underline-offset-4">word</span> possibly
          unclear
        </span>
      </p>
    </div>
  );
}
