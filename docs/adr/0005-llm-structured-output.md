# 0005. Claude structured output, validated, with one repair round

- **Status:** Accepted (milestone M5)
- **Date:** 2026-11-18

## Context

Feedback must be machine-readable (score, strengths, issues with evidence and tips) so the UI can
lay it out and the score can be stored. Free-text replies need fragile parsing; even JSON replies
can break our limits (e.g. five issues, a score of 120) or be cut off by the token limit.

## Decision

- Ask Claude for **structured JSON output** matching our schema (instead of a forced tool call,
  which current models reject). Model from `ANTHROPIC_MODEL`; prompt version recorded
  (`PROMPT_VERSION`) with every analysis.
- Validate the reply: not cut off, valid JSON, and matching the shared Zod `FeedbackSchema`
  (score 0–100, 1–3 strengths, at most 4 issues, length limits). If it fails, send the model its own
  reply plus the problem **once**; a second failure ends the job with `LLM_INVALID_OUTPUT`.
  A refusal fails the job with `LLM_FAILED`.
- The numbers (pace, pauses, fillers, accuracy) are computed in code, not by the model; the model
  explains and prioritizes them.
- Cost and latency of each analysis are stored (`Analysis.costUsdMicros`, `latencyMs`).

## Consequences

- The UI never renders an unvalidated LLM reply.
- Metrics are deterministic and testable; the LLM can't invent a words-per-minute value.
- A repair round can double the LLM cost of a bad reply (rare).
- Changing the prompt means bumping `PROMPT_VERSION`, so old and new feedback can be compared.
