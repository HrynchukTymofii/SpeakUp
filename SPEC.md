# SpeakUp — product spec

SpeakUp is a speaking and communication trainer. People record themselves speaking and get
feedback on pace, pauses, filler words, voice, clarity and (for read-aloud tasks) reading
accuracy, then practice with short lessons and drills.

This document says **what** the product does and the **rules** it must keep. It describes the
product as it is today; work that isn't built yet is listed only in §12. How the system is built
is in [`docs/`](./docs/README.md) (start with [`architecture.md`](./docs/architecture.md)). Code
comments link here by section number (e.g. "SPEC §6.3"), so the numbers stay stable.

---

## 0. Engineering ground rules

1. **Production-shaped, scoped.** Everything we build is the real architecture, not a throwaway,
   but we build only what this spec lists. No speculative abstractions beyond the provider
   interfaces we need (`PaymentProvider`, `SttProvider`, `AuthProvider`).
2. **Readable over clever.** Every file should be explainable by its owner. Prefer explicit code,
   small modules, and comments that explain _why_, not _what_.
3. **TypeScript strict mode everywhere.** No `any` unless a comment justifies it.
4. **Validate at every boundary** with Zod: env vars, HTTP input, webhook payloads, queue jobs,
   LLM output.
5. **Check current docs** for third-party SDKs (Clerk, Deepgram, Paddle, Anthropic, AWS SDK v3,
   Prisma, BullMQ) before using them. Pin dependency versions exactly.
6. **One visual language** across the web app: the design system in
   [`docs/design-system.md`](./docs/design-system.md) (tokens instead of raw colors,
   Manrope/Outfit, the mascot). The funnel (§15) also has to feel interactive: animated step
   transitions, a progress bar, loaders.
7. **Never commit secrets.** Every env var is documented in `.env.example` with a comment.

Working rules for changes (branches, tests, definition of done) are in [`CLAUDE.md`](./CLAUDE.md).

---

## 1. Product scope

### Core user flow

1. **Web funnel** (§15): questions and reflection screens → mini-lesson video → a speaking check
   recorded **anonymously, before sign-up** → sign-up while the analysis runs → results → a few
   more questions → "building your plan" loader → plan summary → paywall.
2. **The app** (Free or Pro), four tabs:
   - **Learn:** courses → lessons. A lesson is _why it matters → example → try this_ plus 2–3
     recorded exercises.
   - **Practice:** modes that hand out a new topic each time (one-minute topic, question storm,
     convince me, tongue twister).
   - **Challenges:** the 7-day story challenge and "speak like a legend".
   - **Profile:** stats, skills, score trend, recurring problems, recent recordings.
3. Every recording ends on a **results report**, and every problem it finds links to the lesson
   that fixes it.

Pages, lesson content and how each feature behaves: [`docs/features.md`](./docs/features.md).

### Exercise types

- `read_aloud`: the user reads a given `referenceText`. We compare the transcript with it
  (missed, substituted and extra words).
- `free_speech`: the user answers a prompt (e.g. "Introduce yourself as if in a job interview,
  45 seconds"). No reference text. Practice-mode attempts also carry the topic they answered.

### Plans

| Plan          | Access                                                                  | Analyses per day |
| ------------- | ----------------------------------------------------------------------- | ---------------- |
| Free          | Speaking check, practice modes, challenges, first lesson of each course | 3                |
| Pro (monthly) | Everything                                                              | 50               |

Quotas reset at 00:00 UTC. Analyses that fail on our side don't count; `NO_SPEECH` does.

---

## 2. Architecture

Web (Next.js on Vercel) → REST API (Fastify on AWS ECS) → a Redis queue → a worker (BullMQ on
ECS) that runs speech-to-text, audio analysis and LLM feedback. Postgres stores the data, S3 the
recordings. Diagrams and flows: [`docs/architecture.md`](./docs/architecture.md).

The shape follows from four requirements:

- **The API is separate from the web app**, so a mobile app can use the same API.
- **Analysis runs in a separate worker.** It takes seconds and calls external APIs that fail now
  and then; the API answers at once, the worker retries and scales on its own.
- **Audio goes straight from the device to S3** (pre-signed upload), never through our servers.
- **Numbers are measured in code; the LLM only interprets them.** Pace, pauses and fillers are
  computed deterministically; Claude turns them into coaching and never invents measurements.

---

## 3. Tech stack

The stack and the reasons for each choice: [`docs/architecture.md`](./docs/architecture.md#tech-stack)
and the decision log (§14). The Claude model is set by `ANTHROPIC_MODEL` (production:
`speakup:anthropicModel` in `infra/cdk/cdk.json`, default `claude-sonnet-5-5`).

---

## 4. Repository layout

See the README's [Repo layout](./README.md#repo-layout).

---

## 5. Data model

The schema is [`packages/db/prisma/schema.prisma`](./packages/db/prisma/schema.prisma); an
overview with a diagram is in [`docs/architecture.md`](./docs/architecture.md#data-model). Rules
the model must keep:

- **Entitlements:** a user is Pro if any `Subscription` has status `active` or `trialing` and its
  `currentPeriodEnd` is empty or in the future. One function decides this: `getEntitlements()` in
  the API. `Subscription.source` lets App Store / Play purchases map into the same table later.
- **Every attempt has an owner:** a user or a funnel session (a CHECK constraint in the database,
  not only in code).
- **Content is seeded**, not edited in an admin UI: `packages/db/src/seed-data.ts`, applied by an
  idempotent `pnpm db:seed`. Lesson videos are plain URLs (configurable); CloudFront + HLS is listed
  in §12.
- **Schema changes stay backward compatible** with the running version (expand → migrate →
  contract), because old and new tasks run side by side during a deploy.

---

## 6. Recording and analysis

### 6.1 Recording (web)

- `MediaRecorder` with the first supported type: `audio/webm;codecs=opus` (Chrome, Firefox),
  `audio/mp4` (Safari), `audio/ogg;codecs=opus`.
- A timer, a hard stop at the exercise's `maxDurationSec`, and play back / re-record before
  submitting.
- Ask for the microphone with a clear explanation; handle a denial with per-browser help.

### 6.2 Upload and attempt lifecycle

1. **Create** (`POST /v1/attempts`): checks access to the exercise (402 `PAYWALL`), the daily
   quota (429 `QUOTA_EXCEEDED`) and a per-user burst limit, creates the attempt
   (`awaiting_upload`) and returns a **pre-signed POST** that fixes the key, the content type and
   a size of 1 KB–10 MB, valid for 5 minutes.
2. The browser **uploads straight to S3**.
3. **Submit** (`POST /v1/attempts/:id/submit`): the API checks the file in S3 itself (exists,
   size), moves the attempt to `queued` and adds an `analyze` job whose **job id is the attempt
   id**, so a double submit can't queue it twice. Answers `202`.
4. **Result** (`GET /v1/attempts/:id`): status, a progress `stage` (_queued → transcribing →
   analyzing → done_) and, when completed, the transcript, metrics and feedback. The web app
   long-polls (`?wait=20`; the API answers as soon as the worker announces a change) for up to
   about 60 s.

Endpoint details: [`docs/api.md`](./docs/api.md#attempts-signed-in-recordings).

### 6.3 The `analyze` job

Up to 3 tries with exponential backoff (5 s, then 10 s). Retryable failures (timeouts, 429, 5xx)
are retried; permanent ones (`NO_SPEECH`, 4xx, invalid LLM output twice) fail at once. On the last
try the attempt is marked `failed` with an `errorCode`. The job is idempotent: a finished attempt
is skipped, and a saved transcript is reused instead of paying for speech-to-text again.

1. **Speech-to-text** through the `SttProvider` interface (Deepgram `nova-2`, given a short-lived
   pre-signed GET URL): filler words kept, punctuation on, word timestamps and confidence. Saved as
   the attempt's `Transcript`.
2. **Audio features** (best effort): ffmpeg decodes the recording to 16 kHz mono; per 10 ms frame
   we measure loudness and pitch (YIN). From that come real silences (threshold relative to the
   recording's own noise floor) and per-word loudness and pitch. If decoding fails or the
   recording is too noisy, the metrics fall back to the transcript.
3. **Metrics** (pure functions, unit-tested):
   - duration and **words per minute**; target band 130–160
   - **pauses** ≥ 0.15 s, measured on the audio (word gaps as a fallback), each classed as
     _boundary_ (at punctuation), _phrase_ or _hesitation_ (≥ 0.4 s mid-phrase, or next to a
     filler); long pauses > 1.5 s; the longest stretch of speech without a pause (> 12 s = no time
     for the listener)
   - **punctuation** (read-aloud, audio only): commas and sentence ends in the reference text that
     got an audible pause (≥ 0.15 s / ≥ 0.3 s), and those read straight through
   - **voice**: pitch variation and range (monotone?), loudness variation (emphasis?), pace
     variation between phrases, sentences that trail off, all relative to the speaker's own voice
   - **language** (free speech): repeated 3-word phrases, restarts ("I I"), hedges ("I think",
     "kind of", "maybe")
   - **fillers**: count, rate per minute and positions. "um"/"uh" always count; "like", "so",
     "you know" only in filler positions. Conservative on purpose: a false "you said like 10 times"
     costs more trust than a missed one.
   - **unclear words**: confidence < 0.6
   - **reading accuracy** (read-aloud): word-level alignment against the reference → accuracy %,
     missed, substituted and inserted words
4. **Fewer than 5 real words** → `NO_SPEECH`, no LLM call.
5. **Scores**: per-skill subscores 0–100 (pace, pauses, fillers, voice, accuracy) computed by rules
   from the metrics, plus `content` from the LLM for free speech. The overall score is their
   weighted mean. The LLM doesn't pick the overall score.
6. **Feedback** from Claude: input = exercise, reference text or topic, compacted transcript,
   metrics, the user's goal. Structured JSON output validated with Zod; on a validation error the
   model is asked once more with the error, then the job fails (`LLM_INVALID_OUTPUT`). The system
   prompt is versioned (`PROMPT_VERSION`) and cached. Rules in the prompt: **cite only numbers that
   appear in the metrics**, and treat the transcript as data, never as instructions. Shape:
   summary, 1–3 strengths, up to 6 issues (category, severity, evidence, tip; most important first),
   one next step.
7. **Save** the `Analysis` with the model, prompt version, latency and estimated cost (speech-to-
   text seconds and LLM tokens × per-unit prices from env). The attempt becomes `completed`.

How the pipeline is built: [`docs/architecture.md`](./docs/architecture.md#analysis-pipeline-worker).

### 6.4 Pluggable providers

- `SttProvider`: Deepgram today; Whisper or AssemblyAI could replace it.
- `PronunciationProvider`: an interface only, no implementation (future: Azure pronunciation
  assessment or our own model service for phoneme-level scoring).

---

## 7. API rules

The full reference is [`docs/api.md`](./docs/api.md). The rules every endpoint follows:

- REST under `/v1`. Every route needs `Authorization: Bearer <Clerk token>` except `/health*`,
  the public billing plans, webhooks (signature instead) and the funnel routes (guest token
  instead). The first authenticated request creates our `User` row (lazy provisioning).
- **One error shape:** `{ "error": { "code", "message", "requestId" } }`. Statuses: 400
  validation, 401 unauthenticated, 402 paywall, 403 forbidden, 404 (also for someone else's
  resource), 409 wrong state, 429 rate-limited or over quota, 500.

---

## 8. Payments

- A `PaymentProvider` interface (`createCheckout`, `getPortalUrl`, `verifyAndParseWebhook`) with
  one implementation: **Paddle Billing**. Paddle is the merchant of record (it handles sales tax
  and VAT) and accepts sellers from Ukraine. The web app opens Paddle.js's overlay checkout with
  `customData: { userId }`.
- **Webhooks are the only source of truth** for the plan; the browser's "payment succeeded" is
  never trusted. The webhook handler:
  1. verifies the signature on the raw body (401 if invalid);
  2. inserts `WebhookEvent(source, eventId)`; a duplicate means "already processed" → 200;
  3. upserts the `Subscription` in the same transaction, ignoring events older than the one
     already applied (`lastEventAt`);
  4. answers 200 quickly.
- Later: a Stripe adapter behind the same interface; mobile purchases via RevenueCat webhooks into
  the same table (`source = app_store | play_store`).

---

## 9. Security and privacy

- The Clerk token is verified on every protected route; identity comes **only** from the verified
  token, never from the body.
- Every read or submit of an attempt checks that the caller owns it.
- Zod validation for all input; unknown fields are rejected.
- Rate limits in Redis: global per IP (300/min), per user on creating attempts (10/min), plus the
  daily plan quotas (§1).
- S3: no public access, encryption at rest, short-lived pre-signed URLs with size and type
  conditions, and a lifecycle rule that deletes uploads never submitted after 1 day.
- Webhook signature verification and idempotency (§8).
- Security headers (helmet), a CORS allowlist, a 100 KB body limit.
- Env validated at boot; the process exits on invalid config. Only publishable keys use
  `NEXT_PUBLIC_`.
- Logs never contain transcripts, audio URLs, tokens or emails, only ids. Redaction happens in the
  logger itself.
- **LLM cost guardrails:** max audio length, max transcript length sent to the LLM, per-user
  quotas, and a spend limit set in the Anthropic console.
- **Prompt injection:** the transcript is user content. It is wrapped in delimiters, delimiter
  characters are stripped from it, and the model is told to treat it as data.
- **Anonymous funnel endpoints** are the main cost risk (anyone could trigger speech-to-text and
  LLM spend without an account). So: Cloudflare Turnstile before an anonymous recording, one
  baseline per funnel session, at most 3 anonymous analyses per IP per day (IP stored only as an
  HMAC), 45 s max, a guest token of 32 random bytes of which only the SHA-256 is stored, sent as
  `Authorization: Guest <token>`. Results are shown **only after the session is claimed** by a
  signed-in account.
- **Cleanup:** unclaimed funnel sessions, their attempts and audio are deleted after 7 days.

---

## 10. Configuration

Every env var is documented in [`.env.example`](./.env.example) and validated by the app that reads
it. Production settings that aren't secrets live in `infra/cdk/cdk.json`; secrets in AWS Secrets
Manager (`speakup/app`). See the README's [Environment variables](./README.md#environment-variables).
Provider prices used for cost estimates come from env, so a price change needs no deploy.

---

## 11. Web app

Two hosts, one Next.js project: marketing pages on `speakup.fibipals.com`, the product on
`app.speakup.fibipals.com` (routing in `apps/web/proxy.ts`; see
[`docs/architecture.md`](./docs/architecture.md#two-hosts-one-web-project)). Every page has its own
URL, including each funnel step, so back/forward and analytics work. All pages and what's on them:
[`docs/features.md`](./docs/features.md#pages).

The web app talks to the API through one typed client (`apps/web/lib/api.ts`) that attaches the
Clerk token and validates responses with the shared schemas; TanStack Query holds server state.

---

## 12. Not built yet

- **Mobile app** (Expo) using the same API, with push notifications for results.
- **Contests**, and comparing a "legend" recording side by side with the original speech.
- **AI-generated topic banks** for the practice modes (static lists today).
- **Server-side progress** for in-app lessons and the user's written story (kept on the device).
- **A full history page** (the profile shows recent recordings; the API already pages through all).
- **Analytics extras:** a cookie-consent banner for EU/UK visitors before Amplitude starts, and
  server-side revenue events from the Paddle webhook (renewals, refunds); see
  [`docs/analytics.md`](./docs/analytics.md#limits-and-caveats).
- **Video hosting:** lesson videos as plain URLs today; CloudFront + HLS with signed URLs for Pro
  videos later.
- **Scaling work** still open (cold start, RDS Proxy): see
  [`docs/scaling.md`](./docs/scaling.md#status).
- **High availability, before the first paying users:** a NAT gateway per AZ first, then a Redis
  replica with automatic failover, then RDS Multi-AZ (about +$75/month together). Order and what
  each one protects: [`docs/scaling.md` §2.6](./docs/scaling.md#26-single-points-of-failure).
- **Error tracking** (e.g. Sentry) for the API, worker and web app: stack traces grouped by cause,
  and errors in the browser, which the CloudWatch alarms can't see. Needs an account and a DSN.

## 13. Out of scope

Real-time or streaming feedback, our own ML models, accent-specific phoneme scoring (designed as
a pluggable provider, §6.4), an admin CMS (content is seeded), email notifications.

---

## 14. Decision log

One row per significant technical choice. The bigger ones also have a decision record in
[`docs/adr/`](./docs/adr/README.md).

| Decision                                                                                                                                                                                    | Why                                                                                                                                                                                                                    | Alternative & when we'd switch                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/TS API                                                                                                                                                                                 | Shared types with web + Expo, I/O-heavy workload, hosted AI models                                                                                                                                                     | Python/FastAPI service when we run our own models                                                                                                                             |
| Fastify                                                                                                                                                                                     | Fast, simple, first-class schema validation, easy to read                                                                                                                                                              | NestJS for a large team needing strict structure; Express is older/slower                                                                                                     |
| REST                                                                                                                                                                                        | Simple, cacheable, fits mobile; few clients, simple data shapes                                                                                                                                                        | GraphQL if many clients need very different data shapes                                                                                                                       |
| Postgres + Prisma                                                                                                                                                                           | Relational data (users, subscriptions, attempts), transactions for billing; Prisma = typed client + migrations                                                                                                         | Drizzle for thinner SQL-like layer; raw SQL for hot paths                                                                                                                     |
| Redis + BullMQ                                                                                                                                                                              | Async audio jobs with retries; rate limits; same Redis                                                                                                                                                                 | AWS SQS + Lambda/ECS consumers at larger scale                                                                                                                                |
| Practice topics on the attempt (`Attempt.topic`), one exercise per mode                                                                                                                     | Thousands of topics without thousands of rows; "already answered" is a query on attempts; the analysis sees the real topic                                                                                             | A `Topic` table when topics get metadata (difficulty, language, AI-generated batches)                                                                                         |
| S3 direct upload                                                                                                                                                                            | Offloads bandwidth from API, secure via pre-signed URLs                                                                                                                                                                | —                                                                                                                                                                             |
| Clerk                                                                                                                                                                                       | Auth is security-critical and solved; supports web + Expo                                                                                                                                                              | Own auth / Cognito / Better Auth if cost or control requires                                                                                                                  |
| Deepgram                                                                                                                                                                                    | Fast, cheap, word timestamps + filler detection                                                                                                                                                                        | Whisper (self-host) to cut cost at scale                                                                                                                                      |
| Claude via tool-use JSON                                                                                                                                                                    | Reliable structured output, validated with Zod                                                                                                                                                                         | Fine-tuned/own model later for scoring                                                                                                                                        |
| Rule-based overall score; LLM only scores content                                                                                                                                           | The LLM's own 0–100 was lenient and inconsistent (a clean read-aloud got 95 → nothing to practice); rules are repeatable, explainable and tunable                                                                      | A model trained on coach-rated recordings once we have labelled data                                                                                                          |
| Pitch/loudness/silence from the waveform (ffmpeg + YIN in TS)                                                                                                                               | STT timestamps are smoothed and say nothing about voice; one runtime, ~100 ms per recording                                                                                                                            | Praat/parselmouth in a Python service if we need formants, jitter/shimmer or accent analysis                                                                                  |
| Paddle (MoR)                                                                                                                                                                                | Handles global tax; available to Ukrainian sellers                                                                                                                                                                     | Stripe if company entity is in a Stripe country                                                                                                                               |
| One Vercel project for two hosts (marketing `speakup.` / product `app.`), routed by host in `proxy.ts`                                                                                      | One build, one set of env vars, shared components and design tokens; the split can be switched on/off with two env vars                                                                                                | Two projects (or Next multi-zones) if the marketing site moves to a CMS/site builder or gets its own release cycle                                                            |
| ECS Fargate                                                                                                                                                                                 | Containers without managing servers; same images as local                                                                                                                                                              | Kubernetes (EKS) only with a platform team                                                                                                                                    |
| Load tests with k6 + simulated AI providers (`ANALYSIS_PROVIDERS=fake`) on a throwaway copy of the prod stack (`SpeakUp-LoadTest`)                                                          | Measures our own system (API, S3, queue, worker, DB) at real scale for $0 in provider cost; fake latencies follow a log-normal so p99s stay realistic; same CDK code = same topology                                   | A short real-provider run (budget-capped) to check provider rate limits; Grafana Cloud k6 for load from many regions/IPs                                                      |
| Results reach the page by long-polling (`GET /attempts/:id?wait=20`, woken by Redis pub/sub from the worker)                                                                                | The result shows up the moment it's saved, a 10 s wait is 1–2 requests instead of ~7 polls, and it works with the existing bearer-token auth and React Query; nothing to stream through the ALB; k6 tests it unchanged | SSE (or WebSockets) if the page needs a continuous stream (live transcript); APNs/FCM push on mobile                                                                          |
| Load-test sign-in = HMAC tokens limited to `loadtest_*` ids, refused in production without `LOAD_TEST_STACK=true`                                                                           | Clerk tokens expire every 60 s and minting thousands would test Clerk, not us; the id prefix means a leaked secret can never act as a real user                                                                        | Clerk testing tokens if Clerk ever offers bulk long-lived ones                                                                                                                |
| Learning progress, streak, XP and lesson suggestions derived from the attempt history in the app (no progress tables); fine-grained problems from metrics by fixed rules (`detectProblems`) | Nothing new to keep in sync; deterministic, testable suggestions; content is still changing, so no schema churn                                                                                                        | Progress tables (or a materialized view) when history gets long, lessons gain non-recorded steps that must sync across devices, or challenges/contests need server-side state |
| Amplitude for product analytics, identified by the Clerk user id                                                                                                                            | Funnel and journey charts on the free plan; a React Native SDK for the mobile app; the Clerk id joins ad visit, paid account and app use without fingerprinting                                                        | PostHog if we outgrow the free plan or need EU hosting/session replay; an event pipeline (Segment) when several tools need the same events                                    |
| Production capacity: up to 25 workers on `db.t4g.small` (in `cdk.json`), not the 10 / micro defaults                                                                                        | The 1,000-user load test passed with exactly this setup; the small DB is ~$12/month more and fits 25 workers' connection pools (107 of ~190); idle cost is unchanged because workers scale down to 1                   | `medium` + RDS Proxy past ~30 workers; back to micro only if cost matters more than headroom                                                                                  |
| Monitoring in CDK (`lib/monitoring.ts`): 11 CloudWatch alarms → one SNS topic → email, one dashboard; error counts from log metric filters on pino's `level`                                | Same stack, same review, same tests as the resources it watches; no new vendor and about $1/month; the JSON logs already carry the level                                                                               | An error tracker (Sentry) for grouped stack traces and the web app; a pager (PagerDuty/Opsgenie) on the SNS topic once someone is on call                                     |

---

## 15. Web funnel

### 15.1 Reference

The funnel reuses the mechanics and feel of a proven funnel from another of the owner's products
(step engine, progress bar, transitions, loaders with questions, reflection screens, paywall
layout), not its content or branding. How that reference works and what SpeakUp does differently:
[`docs/funnel-reference.md`](./docs/funnel-reference.md). Where they disagree, this section wins.

### 15.2 Step sequence

`/start/[step]`. Progress bar across the top for the pre-paywall part. Back button on every step except the loaders and the recording-in-progress state. Answers save on every step (local first, then `PATCH /v1/funnel/sessions/current`).

| #   | Step id        | Type                  | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `goal`         | single choice         | **What do you most want to improve?** Job interviews · Presentations & public speaking · Meetings & calls at work · Everyday conversations · Clarity & accent                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | `situations`   | multi choice          | **When do you feel least confident speaking?** In meetings · On calls / video · Speaking to a group · Small talk with strangers · When I'm put on the spot                                                                                                                                                                                                                                                                                                                                                                              |
| 3   | `reflection-1` | reflection            | Personalized from `goal`. E.g. for interviews: "Interviews reward clear, structured answers more than perfect English. That's a trainable skill." One sentence + subtle illustration + Continue                                                                                                                                                                                                                                                                                                                                         |
| 4   | `language`     | single choice         | **Is English your first language?** Yes · No, I'm fluent · No, I'm intermediate · No, I'm still learning                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | `symptoms`     | multi choice          | **What happens when you get nervous speaking?** I talk too fast · I say "um", "like", "you know" · I lose my train of thought · My voice gets quiet · People ask me to repeat myself                                                                                                                                                                                                                                                                                                                                                    |
| 6   | `reflection-2` | reflection            | Personalized from `symptoms` (first selected item). E.g. talking fast: "Speeding up is a nerves habit, not a skill gap. Your first exercise will measure your pace."                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | `self-rating`  | slider 1–5            | **How would you rate your speaking confidence today?** (labels at 1 and 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | `time`         | single choice         | **How much time can you practice per day?** 5 min · 10 min · 15 min · 20+ min                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | `mini-lesson`  | video lesson          | 45–60 s video (URL from `NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL`, placeholder for now) "How we'll measure your speaking: pace, pauses, filler words, clarity" + 3 bullet takeaways. Continue button activates after 10 s or at video end                                                                                                                                                                                                                                                                                                   |
| 10  | `mic`          | permission            | Explain why we need the mic + privacy line ("Your recording is private and deleted if you don't create an account"). Request permission; handle denial with instructions per browser                                                                                                                                                                                                                                                                                                                                                    |
| 11  | `exercise`     | recording             | **Impromptu speaking check picked by the goal** (`check-<goal>`, e.g. "tell me about yourself" for interviews, a 30-second pitch for pitching; fallback `check-general`). Reading a text aloud is easy and hid the real problems; answering without a script shows hesitations, fillers, a flat voice and rambling. States: ready → 3-2-1 countdown → recording (timer, live level meter, max 45 s) → review (play back / re-record / submit). On submit: Turnstile → `POST /v1/funnel/attempts` → upload → submit. Analysis starts now |
| 12  | `auth`         | auth gate             | "Your analysis is being prepared. Create a free account to see your results." Clerk sign-up embedded (Google + email). A small live status line shows the analysis progressing. On success: `POST /v1/funnel/claim`                                                                                                                                                                                                                                                                                                                     |
| 13  | `results`      | results               | Same report component as `/results/[attemptId]`, funnel variant: score with animated count-up, 3 metric cards (pace vs target band, filler words, pauses), top 2 issues with tips, one strength. If analysis still running: staged loader ("Transcribing → Measuring pace → Writing your feedback")                                                                                                                                                                                                                                     |
| 14  | `deadline`     | single choice         | **Do you have an important speaking moment coming up?** Within a week · Within a month · In a few months · No, just improving                                                                                                                                                                                                                                                                                                                                                                                                           |
| 15  | `focus`        | single choice         | **What should we work on first?** Options generated from results: the top 2 issues + "Overall confidence"                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 16  | `plan-loader`  | loader with questions | "Building your personal plan" with progress 0→100% over ~12 s, checklist items ticking (Analyzing your recording ✓ · Matching lessons to your goal ✓ · Setting your daily practice ✓). At ~30% and ~65% the progress pauses and a modal asks a yes/no question: **"Do you practice speaking out loud now?"** · **"Would daily reminders help you stay consistent?"** Progress resumes after each answer                                                                                                                                 |
| 17  | `plan`         | plan summary          | "Your 4-week plan": week-by-week focus derived from `goal`, `focus`, `time`; baseline score shown as the starting point. No promised outcomes or invented statistics                                                                                                                                                                                                                                                                                                                                                                    |
| 18  | `paywall`      | paywall               | Plan recap at top, what Pro includes, the monthly price localized by Paddle, one upgrade button (Paddle checkout), "cancel anytime", two FAQs. A visible "Continue with the free plan" link → dashboard. No countdowns or fake discounts. Pro users see "You're already on SpeakUp Pro" instead                                                                                                                                                                                                                                         |

### 15.3 Funnel engine (implementation)

- **Config-driven.** `apps/web/funnel/config.ts` exports an ordered array of steps `{ id, type, ...typeSpecificProps, showIf?(answers) }`. Pages render by `type` via a component map. Adding/reordering steps = editing config only.
- **Step types:** `single_choice`, `multi_choice`, `slider`, `reflection`, `video_lesson`, `mic_permission`, `recording`, `auth_gate`, `results`, `loader_with_questions`, `plan_summary`, `paywall`.
- **State:** Zustand store persisted to `localStorage` (answers, current step, guest token, attemptId). Reload resumes where the user left off. Guest token never goes into URLs or logs.
- **Server sync:** create the funnel session on step 1; PATCH answers on each step (debounced, failures don't block the UI).
- **Guards:** you can't open a step whose prerequisites aren't met (e.g. `/start/results` without a claimed attempt redirects to the right step). Already-signed-in users who open `/start` skip `auth`.
- **Personalization text** (reflections, plan) comes from small pure functions in `funnel/personalize.ts`, unit-tested.
- **Copy rule:** no invented statistics or testimonials. Where the reference funnel uses social-proof numbers, put clearly marked `TODO(founder)` placeholders.
- **Transitions:** same style as the reference funnel (e.g. slide/fade between steps), respect `prefers-reduced-motion`.
- **Analytics:** `track(event, props)` sends to Amplitude (`apps/web/funnel/analytics.ts`); without `NEXT_PUBLIC_AMPLITUDE_API_KEY` it only logs in dev. Event catalog and the funnel chart: [`docs/analytics.md`](./docs/analytics.md).
- **Mobile-first layout:** the funnel is mostly opened on phones from ads.
