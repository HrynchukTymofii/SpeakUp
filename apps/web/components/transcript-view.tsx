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

  if (words.length === 0) return <p className="text-muted">No words were recognized.</p>;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-5 shadow-soft-sm">
      <p className="text-[17px] leading-loose text-ink/90">
        {words.map((w, i) => {
          const pause = longPauseAfter.get(i);
          const isFiller = fillerIndexes.has(i);
          const isUnclear = unclearIndexes.has(i);
          return (
            <span key={i}>
              <span
                className={
                  isFiller
                    ? "rounded-md bg-butter px-1 font-semibold text-on-pastel"
                    : isUnclear
                      ? "underline decoration-muted decoration-dotted decoration-2 underline-offset-4"
                      : undefined
                }
                title={isFiller ? "Filler word" : isUnclear ? "Possibly unclear" : undefined}
              >
                {w.punctuated}
              </span>
              {pause !== undefined && (
                <span className="mx-1 rounded-md bg-sky px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-on-pastel">
                  pause {pause.toFixed(1)}s
                </span>
              )}{" "}
            </span>
          );
        })}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
        <span>
          <span className="rounded-md bg-butter px-1 font-semibold text-on-pastel">um</span> filler
          word
        </span>
        <span>
          <span className="rounded-md bg-sky px-1 font-bold text-on-pastel">pause</span> long pause
          (over 1.5 s)
        </span>
        <span>
          <span className="text-ink underline decoration-muted decoration-dotted decoration-2 underline-offset-4">
            word
          </span>{" "}
          possibly unclear
        </span>
      </p>
    </div>
  );
}
