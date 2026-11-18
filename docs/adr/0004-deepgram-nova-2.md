# 0004. Deepgram nova-2, not nova-3, to keep filler words

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Filler words ("um", "uh") are one of the four things SpeakUp measures. Deepgram removes them from
transcripts unless `filler_words=true` is set. Testing on real recordings showed that the newer
**nova-3** model dropped almost every "um/uh" even with that option (0 of 6 on one test clip), so the
filler metric showed zero for people who clearly used fillers.

## Decision

Use `model=nova-2` with `filler_words=true` and `punctuate=true`, and **not** `smart_format`
(it rewrites numbers like "twenty" as "20", which breaks read-aloud accuracy).
See `apps/worker/src/providers/deepgram.ts`.

## Consequences

- Filler counts reflect what people actually said; long "aaa" sounds come out as "uh".
- We stay on an older model and miss nova-3's accuracy gains elsewhere.
- **Revisit** when Deepgram ships a newer model: re-test filler retention on the same clips before
  switching. The speech-to-text provider sits behind the `SttProvider` interface, so a switch is local.
