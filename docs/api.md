# API reference

REST API served by `apps/api` (Fastify). Production base URL: `https://speakup-api.fibipals.com`;
locally `http://localhost:4000`. All endpoints except the health checks are under `/v1`.

The request and response shapes are Zod schemas in [`packages/shared/src`](../packages/shared/src)
(`api/*.ts`, `funnel.ts`, `analysis.ts`). The API validates every input against them and serializes
every output through them, and the web app parses responses with the same schemas — so this page
describes them, but the schemas are the source of truth.

## Authentication

| Scheme           | Header                                                             | Used by                           |
| ---------------- | ------------------------------------------------------------------ | --------------------------------- |
| Clerk session    | `Authorization: Bearer <Clerk session token>`                      | everything marked **user**        |
| Guest token      | `Authorization: Guest <token from POST /v1/funnel/sessions>`       | funnel endpoints marked **guest** |
| Paddle signature | `Paddle-Signature` header, checked against `PADDLE_WEBHOOK_SECRET` | the webhook                       |

A user's identity comes only from the verified token, never from the body or query. The first
authenticated request creates the user's record. Missing or invalid credentials → `401 UNAUTHENTICATED`.

## Errors

Every error has the same body:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "You've used all 3 analyses for today…",
    "requestId": "…"
  }
}
```

Clients branch on `code` (stable; new codes are added, existing ones never renamed), show `message`,
and quote `requestId` to support.

| Code                     | Status | Meaning                                                                         |
| ------------------------ | ------ | ------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400    | body/params don't match the schema (or recording too long)                      |
| `BAD_REQUEST`            | 400    | malformed request (e.g. broken JSON)                                            |
| `UNAUTHENTICATED`        | 401    | missing/invalid token, or invalid webhook signature                             |
| `PAYWALL`                | 402    | the exercise needs Pro                                                          |
| `LESSON_LOCKED`          | 403    | the lesson needs Pro                                                            |
| `BOT_CHECK_FAILED`       | 403    | Turnstile check failed                                                          |
| `FORBIDDEN`              | 403    | not allowed                                                                     |
| `NOT_FOUND`              | 404    | doesn't exist **or isn't yours** (same answer on purpose)                       |
| `WRONG_STATE`            | 409    | not possible in the current state (e.g. already Pro, baseline already recorded) |
| `UPLOAD_MISSING`         | 409    | submit called but no valid file in storage                                      |
| `PAYLOAD_TOO_LARGE`      | 413    | JSON body over 100 KB                                                           |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | not JSON                                                                        |
| `QUOTA_EXCEEDED`         | 429    | daily analyses used up (reset 00:00 UTC)                                        |
| `RATE_LIMITED`           | 429    | too many requests (`Retry-After` header)                                        |
| `NOT_CONFIGURED`         | 503    | feature not configured on this server (e.g. billing without Paddle keys)        |
| `INTERNAL`               | 500    | unexpected error (details only in the logs)                                     |

## Rate limits

| Limit               | Default                    | Key                                           |
| ------------------- | -------------------------- | --------------------------------------------- |
| All requests        | 300 / minute               | client IP (shared across API tasks via Redis) |
| `POST /v1/attempts` | 10 / minute                | user                                          |
| New funnel analyses | 3 / day (UTC)              | hashed client IP                              |
| Analyses per plan   | Free 3 / day, Pro 50 / day | user                                          |

Health checks and the webhook are exempt from the per-IP limit. Values come from the API's env vars
(`RATE_LIMIT_PER_MINUTE`, `ATTEMPTS_PER_MINUTE`, `FUNNEL_IP_DAILY_LIMIT`, `FREE_DAILY_ANALYSES`,
`PRO_DAILY_ANALYSES`).

## Health

| Method | Path            | Auth | Response                                                                                      |
| ------ | --------------- | ---- | --------------------------------------------------------------------------------------------- |
| GET    | `/health`       | —    | `200 {"status":"ok"}` — process is alive                                                      |
| GET    | `/health/ready` | —    | `200` / `503` `{"status":"ok"\|"degraded","checks":{"db":"ok"\|"fail","redis":"ok"\|"fail"}}` |

## Profile

| Method | Path                | Auth | Description                               |
| ------ | ------------------- | ---- | ----------------------------------------- |
| GET    | `/v1/me`            | user | Profile, plan, usage, latest subscription |
| PUT    | `/v1/me/onboarding` | user | Replace onboarding answers                |

`GET /v1/me` → `200`:

```json
{
  "user": {
    "id": "…",
    "email": "a@b.c",
    "createdAt": "ISO date",
    "onboarding": { "goal": "presentations" }
  },
  "entitlements": { "plan": "free", "dailyAnalysesLimit": 3 },
  "usage": { "analysesToday": 1 },
  "subscription": { "status": "active", "currentPeriodEnd": "ISO date", "manageable": true }
}
```

`subscription` is `null` if the user never subscribed; `manageable` says whether the customer
portal is available. `PUT /v1/me/onboarding` body: `{ "answers": { "<question-id>": string | string[] | number | boolean } }`
(ids `a-z0-9-`, at most 50 answers; unknown fields rejected).

## Courses and exercises

| Method | Path                      | Auth | Description                                                                                   |
| ------ | ------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| GET    | `/v1/courses`             | user | Courses with lesson summaries and a per-user `locked` flag                                    |
| GET    | `/v1/lessons/:slug`       | user | Full lesson: video URL, markdown body, exercises. `403 LESSON_LOCKED` for Pro lessons on Free |
| GET    | `/v1/exercises/baseline`  | user | The speaking-check exercise                                                                   |
| GET    | `/v1/exercises/practice`  | user | Standalone practice exercises (`drill-*`, `legend-*`, `challenge-*`), open to every plan      |
| GET    | `/v1/practice/:mode/next` | user | A practice mode's exercise plus a topic the user hasn't answered yet (see below)              |

Each lesson summary in `/v1/courses` also lists its `exerciseSlugs`, so the app can tell from the
attempt history which lessons are done.

**Practice modes** — `mode` is `topic`, `questions`, `convince` or `twister`. One exercise per mode
(`mode-<mode>`); the topics live in `MODE_TOPICS` (`@speakup/shared`). The response is
`{ exercise, topic, done, total }`: a random topic among the ones the user has used least (unused
first, so nothing repeats until the whole bank is done), `done` of `total` topics answered.
`?skip=<topic>` avoids the topic the user just passed on. The app sends the topic back with the
attempt (below), which is how it counts as answered.

An exercise: `{ id, slug, type: "read_aloud" | "free_speech", prompt, referenceText (read-aloud only), maxDurationSec }`.

## Attempts (signed-in recordings)

| Method | Path                      | Auth | Description                                                     |
| ------ | ------------------------- | ---- | --------------------------------------------------------------- |
| POST   | `/v1/attempts`            | user | Create an attempt and get an upload permission                  |
| POST   | `/v1/attempts/:id/submit` | user | Confirm the upload and start the analysis                       |
| GET    | `/v1/attempts`            | user | The caller's history, newest first (`?limit=1–100`, default 50) |
| GET    | `/v1/attempts/:id`        | user | Status, stage, exercise and — when done — the result            |

**History** — `GET /v1/attempts` returns `{ attempts: [{ id, exerciseSlug, status, createdAt,
overallScore, subscores, problems }] }`. `overallScore`/`subscores` are `null` until the analysis is
completed; `problems` are the concrete issues found by `detectProblems` (see
[`features.md`](./features.md#problem-detection-lesson-suggestions)). The app derives progress,
streaks, the profile and lesson suggestions from this list.

**1. Create** — body `{ "exerciseId": "…", "mimeType": "audio/webm;codecs=opus", "topic"?: "…" }`
(base types `audio/webm`, `audio/mp4`, `audio/ogg`; `topic` only for practice modes, ≤ 300 chars,
stored on the attempt and given to the analysis: a free-speech prompt gains the topic, a
read-aloud is compared against it). Checks, in order: per-user burst limit (`429 RATE_LIMITED`),
exercise exists (`404`), plan allows it (`402 PAYWALL`), quota left (`429 QUOTA_EXCEEDED`). → `201`:

```json
{
  "attempt": {
    "id": "…",
    "exerciseId": "…",
    "status": "awaiting_upload",
    "durationMs": null,
    "errorCode": null,
    "topic": null,
    "createdAt": "…"
  },
  "upload": {
    "url": "https://…s3…",
    "fields": {
      "key": "…",
      "Content-Type": "…",
      "tagging": "…",
      "Policy": "…",
      "X-Amz-Signature": "…"
    },
    "maxBytes": 10485760,
    "expiresAt": "…"
  }
}
```

**2. Upload** — the browser POSTs a multipart form to `upload.url` with every entry of `fields` first
and the file last. S3 rejects it unless key, type, tag and size (1 KB – 10 MB) match; the permission
expires after 5 minutes.

**3. Submit** — body `{ "durationMs": 31250 }`. Fails with `409 UPLOAD_MISSING` if the file isn't in
storage or has the wrong size, `400 VALIDATION_ERROR` if longer than the exercise allows (+2 s
tolerance), `409 WRONG_STATE` if the attempt failed earlier. Repeating a successful submit is safe
and returns the current state. → `202 { "attempt": { …, "status": "queued" } }`.

**4. Wait for the result** — `GET /v1/attempts/:id?wait=20` → `200`:

`wait` (optional, 0–25 seconds) is **long-polling**. While the attempt is `queued` or
`processing`, the API holds the request until the worker announces a change (processing,
transcribed, completed, failed) or the time runs out, and then answers with the current state.
Without `wait`, or for any other status, it answers at once. The web app sends the first request
without `wait` and every later one with `wait=20`. `wait` above 25 → `400` (the load balancer
drops connections idle for 60 s).

```json
{ "attempt": { … }, "stage": "analyzing", "exercise": { … }, "result": null }
```

`stage` is one of `awaiting_upload`, `queued`, `transcribing`, `analyzing`, `completed`, `failed`.
On `failed`, `attempt.errorCode` is `NO_SPEECH`, `STT_FAILED`, `LLM_INVALID_OUTPUT`, `LLM_FAILED` or
`INTERNAL`. On `completed`, `result` is:

```json
{
  "overallScore": 72,
  "transcript": {
    "text": "…",
    "words": [{ "word": "um", "punctuated": "Um,", "start": 0.4, "end": 0.6, "confidence": 0.98 }]
  },
  "metrics": {
    "durationSec": 28.1,
    "totalSec": 31.2,
    "wordCount": 74,
    "wpm": 158,
    "wpmTarget": { "min": 130, "max": 160 },
    "pauses": {
      "count": 6,
      "longCount": 1,
      "longestSec": 1.9,
      "list": [{ "start": 12.3, "durationSec": 1.9, "afterWordIndex": 30, "long": true }]
    },
    "fillers": {
      "count": 2,
      "perMinute": 4.3,
      "list": [{ "word": "um", "start": 0.4, "wordIndex": 0 }]
    },
    "lowConfidenceWords": [{ "word": "…", "start": 9.0, "confidence": 0.45, "wordIndex": 22 }],
    "readAloud": {
      "accuracyPct": 94,
      "referenceWordCount": 70,
      "missed": ["too"],
      "substituted": [{ "expected": "follow", "said": "follows" }],
      "inserted": ["um"]
    }
  },
  "feedback": {
    "overallScore": 72,
    "summary": "…",
    "strengths": ["…"],
    "issues": [{ "category": "pace", "severity": "medium", "evidence": "…", "tip": "…" }],
    "nextStep": "…"
  }
}
```

`readAloud` is `null` for free-speech exercises. `issues` has at most 4 entries; `category` is one of
`pace`, `pauses`, `fillers`, `clarity`, `accuracy`, `structure`.

## Funnel (anonymous)

| Method | Path                             | Auth  | Description                                                                                                        |
| ------ | -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| POST   | `/v1/funnel/sessions`            | —     | Start a session → `201 { "token": "…" }` (returned once; only its hash is stored)                                  |
| PATCH  | `/v1/funnel/sessions/current`    | guest | Save answers (merged) and the current step → `204`                                                                 |
| GET    | `/v1/funnel/exercise`            | guest | The speaking check for the session's goal (`check-<goal>`, else `check-general`; max 45 s)                         |
| POST   | `/v1/funnel/attempts`            | guest | Create the baseline attempt; body `{ mimeType, turnstileToken }`                                                   |
| POST   | `/v1/funnel/attempts/:id/submit` | guest | Same as the signed-in submit                                                                                       |
| GET    | `/v1/funnel/attempts/:id`        | guest | Progress only: `{ "attempt": { id, status, stage } }` — never the result                                           |
| POST   | `/v1/funnel/claim`               | user  | Body `{ "guestToken": "…" }`; attaches the session and its attempt to the account → `{ "attemptId": "…" \| null }` |

`POST /v1/funnel/attempts` checks: session not yet claimed (`409`), Turnstile (`403 BOT_CHECK_FAILED`),
one baseline per session (`409 WRONG_STATE`; a re-take before submit replaces the unsubmitted one),
per-IP daily limit (`429 RATE_LIMITED`). The claim is idempotent for the same user and returns
`409 WRONG_STATE` if the session belongs to another account.

## Billing

| Method | Path                   | Auth             | Description                                                                                                                                                                                                                                        |
| ------ | ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/billing/plans`    | —                | Plans on sale: `{ "plans": [{ "id": "pro_monthly", "priceId": "pri_…" }] }`                                                                                                                                                                        |
| POST   | `/v1/billing/checkout` | user             | Body `{ "plan": "pro_monthly" }` → `{ priceId, customData: { userId }, customerEmail }` for Paddle.js. `409` if already Pro                                                                                                                        |
| POST   | `/v1/billing/portal`   | user             | `{ "url": "…" }` — one-time link to Paddle's customer portal. `404` without a subscription                                                                                                                                                         |
| POST   | `/v1/webhooks/paddle`  | Paddle signature | Subscription events (`subscription.created/activated/updated/canceled/past_due/paused`); other events are recorded and ignored. `200 { "received": true }` once handled, including duplicates; a processing error answers `500`, so Paddle retries |

All billing endpoints answer `503 NOT_CONFIGURED` when the server has no Paddle keys.

## Conventions

- JSON in and out; bodies over 100 KB are rejected.
- IDs are opaque strings. Timestamps are ISO 8601 UTC.
- CORS allows only the configured web origins.
- Request ids: clients may send their own `x-request-id`; otherwise the API generates one. It
  appears in every log line for the request and in error bodies (`error.requestId`).
