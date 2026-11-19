import type { Metrics, TranscriptWord } from "@speakup/shared";

/**
 * The transcript with problems marked in place: filler words and hedges highlighted, pauses
 * (hesitations and long ones) shown as markers, punctuation read straight through flagged, and
 * words the recognizer was unsure about underlined.
 * Everything is derived from the metrics (word indexes), so the UI never re-implements the
 * detection rules — it only displays what the worker measured.
 */
export function TranscriptView({ words, metrics }: { words: TranscriptWord[]; metrics: Metrics }) {
  const fillerIndexes = new Set<number>();
  for (const f of metrics.fillers.list) {
    fillerIndexes.add(f.wordIndex);
    if (f.word.includes(" ")) fillerIndexes.add(f.wordIndex + 1); // "you know" spans 2 words
  }
  const hedgeIndexes = new Set<number>();
  for (const h of metrics.language?.hedges.list ?? []) {
    const length = h.phrase.split(" ").length;
    for (let k = 0; k < length; k++) hedgeIndexes.add(h.wordIndex + k);
  }
  // Hesitations always; other pauses only when long (short boundary pauses are good speech).
  const pauseAfter = new Map(
    metrics.pauses.list
      .filter((p) => p.long || p.kind === "hesitation")
      .map((p) => [p.afterWordIndex, p]),
  );
  const readThrough = new Map(
    (metrics.punctuation?.skipped ?? []).map((s) => [s.wordIndex, s.mark]),
  );
  const unclearIndexes = new Set(metrics.lowConfidenceWords.map((w) => w.wordIndex));

  if (words.length === 0) return <p className="text-muted">No words were recognized.</p>;

  const pauses = [...pauseAfter.values()];
  const has = {
    filler: fillerIndexes.size > 0,
    hedge: hedgeIndexes.size > 0,
    hesitation: pauses.some((p) => p.kind === "hesitation"),
    long: pauses.some((p) => p.kind !== "hesitation"),
    readThrough: readThrough.size > 0,
    unclear: unclearIndexes.size > 0,
  };

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-5 shadow-soft-sm">
      <p className="text-[17px] leading-loose text-ink/90">
        {words.map((w, i) => {
          const pause = pauseAfter.get(i);
          const mark = readThrough.get(i);
          const isFiller = fillerIndexes.has(i);
          const isHedge = !isFiller && hedgeIndexes.has(i);
          const isUnclear = unclearIndexes.has(i);
          return (
            <span key={i}>
              <span
                className={
                  isFiller
                    ? "rounded-md bg-butter px-1 font-semibold text-on-pastel"
                    : isHedge
                      ? "rounded-md bg-lav px-1 text-on-pastel"
                      : isUnclear
                        ? "underline decoration-muted decoration-dotted decoration-2 underline-offset-4"
                        : undefined
                }
                title={
                  isFiller
                    ? "Filler word"
                    : isHedge
                      ? "Hedge: softens what you say"
                      : isUnclear
                        ? "Possibly unclear"
                        : undefined
                }
              >
                {w.punctuated}
              </span>
              {mark && (
                <span className="mx-1 rounded-md border border-peach px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-ink">
                  no pause at “{mark}”
                </span>
              )}
              {pause && (
                <span
                  className={`mx-1 rounded-md px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-on-pastel ${
                    pause.kind === "hesitation" ? "bg-rose" : "bg-sky"
                  }`}
                >
                  {pause.kind === "hesitation" ? "hesitation" : "pause"}{" "}
                  {pause.durationSec.toFixed(1)}s
                </span>
              )}{" "}
            </span>
          );
        })}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
        {has.filler && (
          <span>
            <span className="rounded-md bg-butter px-1 font-semibold text-on-pastel">um</span>{" "}
            filler word
          </span>
        )}
        {has.hedge && (
          <span>
            <span className="rounded-md bg-lav px-1 text-on-pastel">kind of</span> hedge
          </span>
        )}
        {has.hesitation && (
          <span>
            <span className="rounded-md bg-rose px-1 font-bold text-on-pastel">hesitation</span>{" "}
            pause mid-sentence
          </span>
        )}
        {has.long && (
          <span>
            <span className="rounded-md bg-sky px-1 font-bold text-on-pastel">pause</span> long
            pause (over 1.5 s)
          </span>
        )}
        {has.readThrough && (
          <span>
            <span className="rounded-md border border-peach px-1 font-bold text-ink">no pause</span>{" "}
            punctuation read straight through
          </span>
        )}
        {has.unclear && (
          <span>
            <span className="text-ink underline decoration-muted decoration-dotted decoration-2 underline-offset-4">
              word
            </span>{" "}
            possibly unclear
          </span>
        )}
      </p>
    </div>
  );
}
