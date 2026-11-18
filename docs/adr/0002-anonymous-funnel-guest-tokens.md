# 0002. Anonymous funnel with guest tokens, claimed at sign-up

- **Status:** Accepted (milestone M5.5)
- **Date:** 2026-11-18

## Context

Visitors from ads should record a speaking check _before_ creating an account — the analysis is the
reason to sign up. Analyses cost money (speech-to-text + LLM), so anonymous access invites abuse,
and anonymous recordings are personal data that must not linger.

## Decision

- `POST /v1/funnel/sessions` creates a session and returns a random **guest token** once; the
  database stores only its SHA-256 hash. It is sent as `Authorization: Guest <token>`, a scheme that
  can't be confused with a Clerk `Bearer` token.
- Before an anonymous analysis: a **Cloudflare Turnstile** check, **one baseline per session**, and a
  **per-IP daily limit** (3), with the IP stored only as a salted hash.
- Guests can see progress, never the result. After sign-up, `POST /v1/funnel/claim` moves the
  session, its attempt and its answers to the account in one transaction (idempotent).
- Unclaimed sessions and their recordings are deleted after 7 days by a daily worker job.

## Consequences

- The analysis runs while the visitor signs up, so results are usually ready right after.
- One shared lifecycle (`attempt-lifecycle.ts`) serves both signed-in and anonymous attempts; an
  attempt is owned by a user **or** a funnel session (database CHECK constraint).
- Shared IPs (offices, mobile carriers) can hit the per-IP limit; it's a tunable env var.
- Losing the browser's storage loses the guest token — the visitor starts over (acceptable for a
  45-second check).
