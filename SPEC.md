# SpeakUp — MVP Build Spec (for Claude Code)

> Working name: **SpeakUp**. A speaking & communication skills trainer: users take lessons, record themselves speaking, and get AI feedback on pace, pauses, filler words, clarity and (for read-aloud tasks) accuracy.
>
> This document is the single source of truth for the build. Read it fully before writing code. Work **milestone by milestone** (section 12). After each milestone, stop, summarize what was built, and append an entry to `LEARNING_NOTES.md` (section 13).

---

## 0. Ground rules for Claude Code

1. **Production-shaped, MVP-scoped.** Every part we build should be the real architecture, not a throwaway — but we build only the features listed here. No speculative abstractions beyond those explicitly requested (e.g. `PaymentProvider`, `SttProvider`).
2. **Readable over clever.** The owner of this repo must be able to explain every file in a technical interview. Prefer explicit code, small modules, and comments that explain *why*, not *what*.
3. **TypeScript strict mode everywhere.** No `any` unless justified in a comment.
4. **Validate at every boundary** with Zod: env vars, HTTP inputs, webhook payloads, LLM output.
5. **Check current docs** for third-party SDKs (Clerk, Deepgram, Paddle, Anthropic, AWS SDK v3, Prisma, BullMQ) before using them — APIs change. Pin versions in `package.json`.
6. **One visual language across the web app.** Every screen (landing, funnel, dashboard, lessons, results, billing, pricing, sign-in) follows the design system in [`docs/design-system.md`](./docs/design-system.md): the dark · warm theme on true black, design tokens instead of raw colors, Manrope/Outfit, and the SpeakUp mascot. The **web funnel (§15)** additionally must feel interactive (animated step transitions, progress bar, loaders), modeled on the reference funnel described in §15.
7. Never commit secrets. Every new env var goes into `.env.example` with a comment.

---

## 1. Product scope (MVP)

### Core user flow
1. **Web funnel** (full spec in §15): questions with reflection screens → mini-lesson video → **baseline recording done anonymously, before sign-up** → sign up (Clerk) while the analysis runs in the background → **results** → a few more questions → "building your plan" loader with in-loader questions → plan summary → **paywall**.
2. **Dashboard** (after paywall, Pro or Free): course → lessons; each lesson = short video + text + 1–2 speaking exercises; attempt history with scores.

### Exercise types
- `read_aloud` — user reads a given `referenceText`. We can compare transcript vs reference (missed / substituted / extra words).
- `free_speech` — user answers a prompt (e.g. "Introduce yourself as if in a job interview, 45 seconds"). No reference text.

### Plans
| Plan | Access | Analyses |
|---|---|---|
| Free | Baseline + practice drills + the first lesson of each course | 3 / day |
| Pro (monthly) | All lessons | 50 / day |

### Explicitly out of scope for MVP
Mobile app (but the API must be ready for it), real-time/streaming feedback, custom ML models, accent-specific phoneme scoring (designed as a pluggable provider, see §6.4), admin CMS (content is seeded), email notifications.

---

## 2. Architecture

```
                    ┌──────────────────────────┐
                    │  apps/web (Next.js)      │  ← later: apps/mobile (Expo) uses same API
                    │  UI, Clerk session,      │
                    │  MediaRecorder, Paddle.js│
                    └──────┬───────────┬───────┘
          Bearer JWT (Clerk)│           │ PUT audio (pre-signed URL)
                           ▼           ▼
┌────────────────────────────────┐   ┌──────────────────┐
│ apps/api (Fastify, Node, TS)   │   │ AWS S3 (private) │
│ - auth (verify Clerk JWT)      │──▶│ recordings/...   │
│ - REST /v1/*                   │   └────────▲─────────┘
│ - pre-signed upload URLs       │            │ GET (pre-signed)
│ - quotas, rate limits (Redis)  │            │
│ - webhooks (Paddle)            │   ┌────────┴──────────────────────┐
│ - enqueue analysis jobs ───────┼──▶│ Redis (BullMQ queue + limits) │
└──────────────┬─────────────────┘   └────────┬──────────────────────┘
               │ Prisma                       │ jobs
               ▼                              ▼
       ┌──────────────┐            ┌──────────────────────────────┐
       │ PostgreSQL   │◀───────────│ apps/worker (Node, BullMQ)   │
       └──────────────┘   Prisma   │ 1. STT (Deepgram)            │
                                   │ 2. metrics (pure TS)         │
                                   │ 3. LLM feedback (Claude)     │
                                   └──────────────────────────────┘
```

**Why this shape (be ready to explain):**
- **Separate API from web**: the mobile app will call the same API; web is just one client.
- **Separate worker**: audio analysis takes 5–20 s and calls flaky external APIs. The API responds instantly; the worker processes with retries and scales independently.
- **Direct-to-S3 uploads**: audio never passes through our API servers (saves bandwidth/memory; API stays fast).
- **Deterministic metrics in code, LLM for interpretation**: numbers (WPM, pauses, fillers) are computed reliably; Claude turns them into human coaching. LLMs are bad at measuring audio, good at explaining.
- **Future Python service**: when we train custom models (pronunciation/accent), they live in a separate FastAPI service the worker calls. Node stays the API layer.

---

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | |
| Web | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | |
| API | Fastify + `fastify-type-provider-zod` | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` (Redis store) |
| Worker | BullMQ on Redis | |
| DB | PostgreSQL 16 + Prisma ORM | Local via Docker; prod: AWS RDS |
| Cache/queue | Redis 7 | Local via Docker; prod: AWS ElastiCache |
| Auth | Clerk | Web: `@clerk/nextjs`; API: verify JWT via `@clerk/fastify` or `@clerk/backend` |
| Storage | AWS S3 (private bucket) | AWS SDK v3, pre-signed POST for upload |
| STT | Deepgram (pre-recorded, Nova model) | word timestamps + confidence + filler words |
| LLM | Anthropic Claude API | model from env `ANTHROPIC_MODEL`, default `claude-sonnet-5-5` |
| Payments | **Paddle Billing** (sandbox) behind a `PaymentProvider` interface | Stripe adapter can be added later (§8) |
| Validation | Zod (shared schemas in `packages/shared`) | |
| Logging | pino (Fastify default) with request IDs | |
| Tests | Vitest | |
| CI | GitHub Actions: install → lint → typecheck → test | |
| Deploy (target) | Web: Vercel. API + worker: Docker → AWS ECS Fargate. RDS, ElastiCache, S3, Secrets Manager. IaC: AWS CDK (TypeScript) | Milestone 8 |

---

## 4. Repository layout

```
speakup/
├─ apps/
│  ├─ web/                 # Next.js
│  ├─ api/                 # Fastify
│  │  └─ src/
│  │     ├─ server.ts      # build app, register plugins
│  │     ├─ env.ts         # zod-validated env
│  │     ├─ plugins/       # auth, prisma, redis, rate-limit, error handler
│  │     ├─ routes/        # me, courses, lessons, attempts, billing, webhooks
│  │     └─ services/      # storage (S3), quota, payments/
│  └─ worker/
│     └─ src/
│        ├─ index.ts       # BullMQ worker bootstrap
│        ├─ pipeline.ts    # orchestrates one analysis job
│        ├─ stt/           # SttProvider interface + deepgram.ts
│        ├─ metrics/       # pure functions: pace, pauses, fillers, alignment
│        └─ feedback/      # prompt, Claude call, schema validation
├─ packages/
│  ├─ db/                  # prisma/schema.prisma, migrations, seed.ts, client export
│  └─ shared/              # zod schemas + TS types shared by web/api/worker
├─ infra/
│  ├─ docker-compose.yml   # postgres + redis for local dev
│  └─ cdk/                 # (Milestone 8) AWS infrastructure
├─ .github/workflows/ci.yml
├─ .env.example
├─ LEARNING_NOTES.md
└─ README.md
```

---

## 5. Data model (Prisma)

```prisma
enum ExerciseType   { read_aloud free_speech }
enum AttemptStatus  { awaiting_upload queued processing completed failed }
enum Plan           { free pro }
enum PaymentSource  { paddle stripe app_store play_store }
enum SubStatus      { active trialing past_due canceled }

model User {
  id           String   @id @default(cuid())
  clerkUserId  String   @unique
  email        String?
  onboarding   Json?                    // quiz answers
  createdAt    DateTime @default(now())
  attempts      Attempt[]
  subscriptions Subscription[]
  funnelSessions FunnelSession[]
}

model Course {
  id      String   @id @default(cuid())
  slug    String   @unique
  title   String
  summary String
  order   Int
  lessons Lesson[]
}

model Lesson {
  id        String     @id @default(cuid())
  courseId  String
  course    Course     @relation(fields: [courseId], references: [id])
  slug      String     @unique
  title     String
  order     Int
  videoUrl  String?    // MVP: public/unlisted video URL; later: CloudFront HLS
  body      String     // markdown
  isFree    Boolean    @default(false)
  exercises Exercise[]
  @@index([courseId, order])
}

model Exercise {
  id             String       @id @default(cuid())
  lessonId       String?      // null = baseline assessment exercise
  lesson         Lesson?      @relation(fields: [lessonId], references: [id])
  slug           String       @unique
  type           ExerciseType
  prompt         String
  referenceText  String?      // required for read_aloud
  maxDurationSec Int          @default(60)
  order          Int          @default(0)
  attempts       Attempt[]
}

model FunnelSession {
  id          String    @id @default(cuid())
  tokenHash   String    @unique          // sha256 of the guest token; raw token lives only on the client
  answers     Json      @default("{}")   // { questionId: answer }
  currentStep String?
  userId      String?                    // set when claimed after sign-up
  user        User?     @relation(fields: [userId], references: [id])
  ipHash      String?                    // for abuse limits, never the raw IP
  createdAt   DateTime  @default(now())
  claimedAt   DateTime?
  attempts    Attempt[]
  @@index([createdAt])                   // cleanup job for unclaimed sessions
}

model Attempt {
  id          String        @id @default(cuid())
  userId      String?       // null while anonymous (funnel baseline); set on claim
  user        User?         @relation(fields: [userId], references: [id])
  funnelSessionId String?
  funnelSession   FunnelSession? @relation(fields: [funnelSessionId], references: [id])
  // Invariant (enforced in code + a CHECK constraint in the migration): userId OR funnelSessionId is set.
  exerciseId  String
  exercise    Exercise      @relation(fields: [exerciseId], references: [id])
  status      AttemptStatus @default(awaiting_upload)
  audioKey    String        // S3 object key
  mimeType    String
  durationMs  Int?
  errorCode   String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  transcript  Transcript?
  analysis    Analysis?
  @@index([userId, createdAt])  // history list + daily quota count
}

model Transcript {
  id        String  @id @default(cuid())
  attemptId String  @unique
  attempt   Attempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  provider  String
  text      String
  words     Json    // [{word, start, end, confidence}]
}

model Analysis {
  id             String   @id @default(cuid())
  attemptId      String   @unique
  attempt        Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  metrics        Json     // see packages/shared MetricsSchema
  feedback       Json     // see packages/shared FeedbackSchema
  overallScore   Int      // 0–100, denormalized for lists
  llmModel       String
  promptVersion  String
  costUsdMicros  Int      // estimated cost, 1 USD = 1_000_000
  latencyMs      Int
  createdAt      DateTime @default(now())
}

model Subscription {
  id                     String        @id @default(cuid())
  userId                 String
  user                   User          @relation(fields: [userId], references: [id])
  source                 PaymentSource
  providerCustomerId     String?
  providerSubscriptionId String        @unique
  plan                   Plan
  status                 SubStatus
  currentPeriodEnd       DateTime?
  updatedAt              DateTime      @updatedAt
  @@index([userId])
}

model WebhookEvent {
  id          String   @id @default(cuid())
  source      PaymentSource
  eventId     String
  type        String
  receivedAt  DateTime @default(now())
  @@unique([source, eventId])   // idempotency: process each event once
}
```

**Entitlements rule:** a user is `pro` if they have any `Subscription` with `status in (active, trialing)` and (`currentPeriodEnd` is null or in the future). Computed in one function `getEntitlements(userId)` in the API. `source` exists so App Store / Play subscriptions (via RevenueCat webhooks later) map into the same table.

**Seed** (`packages/db/prisma/seed.ts`, content in `packages/db/src/seed-data.ts`): a shared "Speaking basics" course plus one course per goal track (conversation, pitching, presentations, job interviews, meetings); every lesson = why it matters → example → try this, with 2–3 exercises; the first lesson of each course is free. Standalone exercises: the `baseline` read-aloud, the funnel's speaking checks (`check-<goal>`), and practice exercises (`drill-*`, `legend-*`, `challenge-*`). Use placeholder video URLs (configurable).

---

## 6. Audio analysis pipeline

### 6.1 Recording (web)
- Use `MediaRecorder`. Detect supported mime type (`audio/webm;codecs=opus` on Chrome/Firefox, `audio/mp4` on Safari).
- Show a timer, enforce `maxDurationSec`, allow re-record before submitting.
- Ask mic permission with a clear explanation; handle denial gracefully.

### 6.2 Upload + attempt lifecycle (API)
1. `POST /v1/attempts` `{ exerciseId, mimeType }`
   - Auth required. Check exercise access (free vs pro lesson) and **daily quota** (count attempts today via the `[userId, createdAt]` index). Return `402` with `{code: "PAYWALL"}` or `429` `{code: "QUOTA_EXCEEDED"}` as appropriate.
   - Create `Attempt(status=awaiting_upload, audioKey=recordings/{userId}/{attemptId}.{ext})`.
   - Return a **pre-signed POST** (S3 `createPresignedPost`) with conditions: exact key, `Content-Type` match, `content-length-range` 1 KB–10 MB, expiry 5 min.
2. Browser uploads directly to S3.
3. `POST /v1/attempts/:id/submit` `{ durationMs }`
   - Verify ownership + status `awaiting_upload`. `HeadObject` to confirm the file exists and size is within limits.
   - Set `status=queued`, enqueue BullMQ job `analyze` with **`jobId = attemptId`** (prevents duplicate jobs if the client double-submits). Return `202`.
4. `GET /v1/attempts/:id` → status + (when completed) transcript, metrics, feedback. Web long-polls (`?wait=20`: the API answers when the worker announces a change via Redis pub/sub; max ~60 s in total), showing progress states: *Uploading → Transcribing → Analyzing → Done*. (Later: push notifications on mobile.)

### 6.3 Worker job `analyze(attemptId)`
Retries: 3 attempts, exponential backoff. Idempotent: if the attempt is already `completed`, exit.

1. `status=processing`.
2. **STT** via `SttProvider` interface (implementation: Deepgram, pre-recorded API, pass a short-lived pre-signed GET URL). Options: smart formatting/punctuation, **filler words enabled**, word timestamps. Normalize output to `{ text, words: [{word, start, end, confidence}] }` and save `Transcript`.
3. **Audio features** (`worker/src/audio`, best effort): the recording is decoded with ffmpeg to 16 kHz mono PCM; per 10 ms frame we measure loudness (dB) and, with the YIN algorithm, pitch. From that: real silences (adaptive threshold relative to the recording's own noise floor and speech level) and per-word loudness/pitch. If decoding fails or the recording is too noisy, metrics fall back to the transcript.
4. **Metrics** (pure functions in `worker/src/metrics`, fully unit-tested):
   - `durationSec` (first word start → last word end) and `totalSec`
   - `wpm` (words / speaking minutes); target band 130–160 for conversational English
   - `pauses`: silences ≥ 0.15 s, measured on the audio (STT word gaps as a fallback — STT timestamps are smoothed and hide comma-length pauses); each classified as `boundary` (at punctuation), `phrase` or `hesitation` (≥ 0.4 s mid-phrase, or next to a filler); count, longest, long pauses > 1.5 s, `longestRunSec` (speech without any pause; > 12 s = no time for the listener)
   - `punctuation` (read-aloud, audio pauses only): commas / sentence ends in the reference text that got an audible pause (≥ 0.15 s / ≥ 0.3 s), and the ones read straight through
   - `voice`: per-word pitch variation and range in semitones (monotone?), loudness variation in dB (emphasis?), pace variation between phrases, sentences that trail off — all relative to the speaker's own voice
   - `language` (free speech): repeated 3-word phrases, restarts ("I I"), hedges ("I think", "kind of", "maybe")
   - `fillers`: count + rate per minute + positions (um, uh, erm, like*, you know, so*) — *context words counted only when Deepgram marks them as fillers or by simple heuristics; keep it conservative
   - `lowConfidenceWords`: words with confidence < 0.6 (proxy for unclear pronunciation)
   - `readAloud` (only for `read_aloud`): normalize both texts (lowercase, strip punctuation), word-level alignment (Levenshtein / LCS) → `accuracy %`, `missed[]`, `substituted[{expected, said}]`, `inserted[]`
5. **Scores** (`worker/src/scoring.ts`): per-skill subscores 0–100 computed by rules from the metrics (pace, pauses/punctuation, fillers, voice, accuracy), plus `content` from the LLM (free speech only); `overallScore` = their weighted mean. The LLM no longer picks the overall score.
6. **Feedback** via Claude (`worker/src/feedback`):
   - Input: exercise type/prompt, reference text (if any), transcript (with timestamps compacted), metrics JSON, user goal from onboarding (or from `FunnelSession.answers` for an anonymous funnel attempt).
   - Force structured output using **tool use with a JSON schema** (`tool_choice` forced to one tool `submit_feedback`). Validate with Zod `FeedbackSchema`; on failure retry once with the validation error appended; then fail the job.
   - Low temperature. System prompt stored in `feedback/prompt.ts` with `PROMPT_VERSION` constant. Use prompt caching for the static system prompt.
   - `FeedbackSchema`:
     ```ts
     {
       overallScore: number 0–100,
       summary: string,                // 2–3 sentences, encouraging, specific
       strengths: string[] (1–3),
       issues: Array<{
         category: "pace" | "pauses" | "fillers" | "clarity" | "accuracy" | "structure" | "voice" | "content",
         severity: "low" | "medium" | "high",
         evidence: string,             // quote or timestamp from the transcript
         tip: string                   // one concrete, actionable fix
       }> (max 6 — every measured problem, most important first),
       nextStep: string,               // what to practice next
       subscores?: Array<{ skill, score }> // added by the worker, not the LLM
     }
     ```
     The model returns the same minus `overallScore`/`subscores`, plus `contentScore` (0–100, null for read-aloud).
     ```ts
     ```
   - Rule in the prompt: **only cite numbers that appear in the metrics JSON**; never invent measurements.
7. Save `Analysis` (incl. `costUsdMicros` estimated from STT seconds + LLM input/output tokens using per-unit prices from env, and `latencyMs`). `status=completed`.
8. On final failure: `status=failed`, `errorCode` (e.g. `STT_FAILED`, `NO_SPEECH`, `LLM_INVALID_OUTPUT`). If transcript has < 5 words → `NO_SPEECH` and a friendly message, no LLM call.

### 6.4 Pluggable providers (design only, implement Deepgram now)
- `SttProvider` — Deepgram now; Whisper/AssemblyAI later.
- `PronunciationProvider` (interface only, no implementation in MVP) — future: Azure Pronunciation Assessment or our own Python/FastAPI model service for phoneme-level/accent scoring.

---

## 7. API (REST, `/v1`)

All routes except `/health`, webhooks and the guest-token funnel routes require `Authorization: Bearer <Clerk JWT>`. On first authenticated request, upsert `User` by `clerkUserId` (lazy provisioning).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness (+ DB/Redis ping at `/health/ready`) |
| GET | `/v1/me` | user profile + entitlements + today's usage |
| PUT | `/v1/me/onboarding` | save quiz answers |
| GET | `/v1/courses` | courses with lessons (locked flag per lesson) |
| GET | `/v1/lessons/:slug` | lesson + exercises (403 if locked) |
| GET | `/v1/exercises/baseline` | baseline exercise |
| POST | `/v1/funnel/sessions` | **no auth.** Create funnel session, return guest token (shown once) |
| PATCH | `/v1/funnel/sessions/current` | **guest token.** Save answers + current step |
| POST | `/v1/funnel/attempts` | **guest token + Turnstile token.** Create the anonymous baseline attempt + pre-signed upload (max 1 baseline per session) |
| POST | `/v1/funnel/attempts/:id/submit` | **guest token.** Confirm upload, enqueue analysis |
| GET | `/v1/funnel/attempts/:id` | **guest token.** Status only (`queued/processing/completed/failed`), never the result |
| POST | `/v1/funnel/claim` | **Clerk JWT + guest token.** Attach session + attempt to the signed-in user, copy answers into `User.onboarding`. Idempotent |
| POST | `/v1/attempts` | create attempt + pre-signed upload |
| POST | `/v1/attempts/:id/submit` | confirm upload, enqueue |
| GET | `/v1/attempts/:id` | status/result |
| GET | `/v1/attempts?cursor=&limit=` | history (cursor pagination) |
| POST | `/v1/billing/checkout` | returns data for Paddle.js checkout (priceId, customData.userId) |
| POST | `/v1/billing/portal` | customer portal / cancel link |
| POST | `/v1/webhooks/paddle` | Paddle webhook (raw body, signature verified) |

**Error format** (single Fastify error handler): `{ error: { code: string, message: string, requestId: string } }`. Status codes: 400 validation, 401 unauthenticated, 402 paywall, 403 forbidden, 404, 409 wrong state, 429 rate-limited/quota, 500.

---

## 8. Payments

- `PaymentProvider` interface: `createCheckout(user, plan)`, `getPortalUrl(user)`, `verifyAndParseWebhook(rawBody, headers) → NormalizedEvent`.
- **Paddle Billing** implementation (sandbox). Paddle is a *merchant of record* (handles global sales tax/VAT) and onboards sellers from Ukraine. Web uses Paddle.js overlay checkout with `customData: { userId }`.
- Webhook handler:
  1. Verify signature (Paddle SDK `webhooks.unmarshal` or manual HMAC-SHA256 of `ts:rawBody`). Reject invalid with 401.
  2. **Idempotency**: insert `WebhookEvent(source, eventId)`; if unique violation → already processed → return 200.
  3. In **one DB transaction**: upsert `Subscription` from `subscription.created/updated/canceled` events; save the WebhookEvent row.
  4. Return 200 fast. Never trust the client "success" redirect for entitlements — webhooks are the source of truth.
- A `stripe` adapter can be added later behind the same interface without touching routes.
- Mobile (future): App Store / Google Play in-app purchases via RevenueCat → RevenueCat webhook → same `Subscription` table with `source=app_store|play_store`.

---

## 9. Security checklist (must be implemented)

- Clerk JWT verified on every protected route; user identity **only** from the verified token, never from the request body.
- Authorization: every attempt read/submit checks `attempt.userId === currentUser.id`.
- Zod validation for all inputs; reject unknown fields.
- Rate limiting (Redis-backed): global per-IP, stricter per-user on `POST /v1/attempts` (e.g. 10/min). Plus daily plan quotas (§1).
- S3 bucket: block all public access, server-side encryption, pre-signed URLs with short TTL and size/type conditions, lifecycle rule to delete abandoned `awaiting_upload` objects after 1 day.
- Webhook signature verification + idempotency.
- `@fastify/helmet`, CORS allowlist from env.
- Env validated at boot with Zod; process exits on invalid config. Only publishable keys use `NEXT_PUBLIC_`.
- Don't log transcripts, audio URLs, tokens, or emails. Log IDs.
- LLM cost guardrails: max audio duration, max transcript length sent to LLM, per-user quotas, and a provider-side spend limit (configured in the Anthropic console — note this in README).
- Prompt injection awareness: transcript is user content — wrap it in clear delimiters and instruct the model to treat it as data, not instructions.
- **Anonymous funnel endpoints** are the main cost risk (anyone can trigger STT + LLM spend without an account). Required: Cloudflare Turnstile verification on `POST /v1/funnel/attempts`; max 1 baseline attempt per funnel session; per-IP limit (e.g. 3 funnel analyses / day, Redis, IP stored only as a hash); max 45 s audio; guest token is 32 random bytes, only its sha256 is stored, sent as `Authorization: Guest <token>`. Results are returned **only after claim** (to a signed-in owner).
- **Cleanup:** a daily job deletes unclaimed funnel sessions, their attempts and S3 audio after 7 days (privacy + cost).

---

## 10. Environment variables (`.env.example`)

```
# shared
NODE_ENV=development
DATABASE_URL=postgresql://speakup:speakup@localhost:5432/speakup
REDIS_URL=redis://localhost:6379

# web
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL=   # mini-lesson video shown in the funnel

# api
API_PORT=4000
CORS_ORIGINS=http://localhost:3000
AWS_REGION=us-east-1
S3_BUCKET=
AWS_ACCESS_KEY_ID=          # local dev only; prod uses IAM task role
AWS_SECRET_ACCESS_KEY=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_PRICE_ID_PRO_MONTHLY=
TURNSTILE_SECRET_KEY=           # Cloudflare Turnstile (bot check on anonymous funnel recording)
FUNNEL_IP_DAILY_LIMIT=3
FREE_DAILY_ANALYSES=3
PRO_DAILY_ANALYSES=50

# worker
DEEPGRAM_API_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
PRICE_STT_USD_PER_MIN=      # fill from provider pricing page
PRICE_LLM_INPUT_USD_PER_MTOK=
PRICE_LLM_OUTPUT_USD_PER_MTOK=
```

---

## 11. Web app pages

Two hosts, one Next.js project: marketing pages on `speakup.fibipals.com`, the product on
`app.speakup.fibipals.com` (routing in `apps/web/proxy.ts`; see `docs/architecture.md`).

| Route | Content |
|---|---|
| `/` | (site) Landing: value prop, CTA "Take the 2-minute speaking check" → `/start` on the app host |
| `/privacy`, `/terms`, `/refund` | (site) Legal pages; Paddle's domain review requires them |
| `/start/[step]` | The web funnel (§15). One URL per step so back/forward and analytics work |
| `/sign-in`, `/sign-up` | Clerk components (also embedded inside the funnel's auth step) |
| `/results/[attemptId]` | Report: score, metrics cards (WPM vs target band, pauses, fillers, accuracy), transcript with highlighted fillers/long pauses/missed words, AI feedback, CTA (upgrade or next lesson) |
| `/app` | Dashboard: course progress, recent attempts |
| `/app/lessons/[slug]` | Video + text + exercises (locked → paywall) |
| `/app/history` | All attempts |
| `/pricing` | Free vs Pro, Paddle checkout |
| `/app/billing` | Plan status, manage subscription |

Data fetching: a small typed API client in `apps/web/lib/api.ts` that attaches the Clerk token; TanStack Query for server state (caching, polling with `refetchInterval` on the results page).

---

## 12. Milestones (do them in order; stop after each)

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold monorepo, docker-compose (Postgres, Redis), env validation, ESLint/Prettier, Vitest, CI workflow | `pnpm dev` starts web+api+worker; CI green |
| M1 | Prisma schema, migration, seed | `pnpm db:seed` creates course, lessons, baseline |
| M2 | Clerk auth web + API verification, `/v1/me`, lazy user upsert, onboarding save | Signed-in user sees their profile from API |
| M3 | Courses/lessons API + UI, locking logic | Free user sees Lesson 1, others locked |
| M4 | Recorder component, attempt creation, S3 pre-signed upload, submit, enqueue | Audio lands in S3; job appears in queue |
| M5 | Worker: Deepgram → metrics → Claude → save; results page with polling | Full baseline flow works end-to-end |
| M5.5 | **Web funnel (§15)**: study the reference funnel, build the step engine + all steps, anonymous attempt + claim, Turnstile, cleanup job | A new visitor goes from `/start/goal` to the paywall; the baseline recorded before sign-up shows up in their results after sign-up |
| M6 | Paddle sandbox checkout, webhook + idempotency, entitlements, quotas, paywall | Test purchase unlocks Pro; replayed webhook is a no-op |
| M7 | Hardening: rate limits, error handler, logging, NO_SPEECH path, tests for metrics/webhooks/feedback parsing | `pnpm test` covers listed cases |
| M8 | Dockerfiles for api/worker; AWS CDK stack (VPC, RDS, ElastiCache, S3, ECS Fargate services, Secrets Manager, IAM task roles); web on Vercel | `cdk synth` succeeds; deploy guide in README |

---

## 13. LEARNING_NOTES.md (required after every milestone)

The repo owner is preparing for technical interviews. After each milestone append a section:

```
## M<n> — <title>
**What we built:** 3–5 bullets.
**Key concepts (explain like to a junior):** each concept used (e.g. "pre-signed URL", "idempotency", "BullMQ job", "DB index") in 2–4 sentences, tied to the actual file where it appears.
**Why this choice / alternatives:** 1–3 trade-offs (e.g. Fastify vs Express vs NestJS).
**Where it breaks at scale & what we'd do:** 2–3 bullets.
**Likely interview questions:** 3–5 questions with short answers.
```

---

## 14. Decision log (for interview conversation)

| Decision | Why | Alternative & when we'd switch |
|---|---|---|
| Node/TS API | Shared types with web + Expo, I/O-heavy workload, hosted AI models | Python/FastAPI service when we run our own models |
| Fastify | Fast, simple, first-class schema validation, easy to read | NestJS for a large team needing strict structure; Express is older/slower |
| REST | Simple, cacheable, fits mobile; few clients, simple data shapes | GraphQL if many clients need very different data shapes |
| Postgres + Prisma | Relational data (users, subscriptions, attempts), transactions for billing; Prisma = typed client + migrations | Drizzle for thinner SQL-like layer; raw SQL for hot paths |
| Redis + BullMQ | Async audio jobs with retries; rate limits; same Redis | AWS SQS + Lambda/ECS consumers at larger scale |
| Practice topics on the attempt (`Attempt.topic`), one exercise per mode | Thousands of topics without thousands of rows; "already answered" is a query on attempts; the analysis sees the real topic | A `Topic` table when topics get metadata (difficulty, language, AI-generated batches) |
| S3 direct upload | Offloads bandwidth from API, secure via pre-signed URLs | — |
| Clerk | Auth is security-critical and solved; supports web + Expo | Own auth / Cognito / Better Auth if cost or control requires |
| Deepgram | Fast, cheap, word timestamps + filler detection | Whisper (self-host) to cut cost at scale |
| Claude via tool-use JSON | Reliable structured output, validated with Zod | Fine-tuned/own model later for scoring |
| Rule-based overall score; LLM only scores content | The LLM's own 0–100 was lenient and inconsistent (a clean read-aloud got 95 → nothing to practice); rules are repeatable, explainable and tunable | A model trained on coach-rated recordings once we have labelled data |
| Pitch/loudness/silence from the waveform (ffmpeg + YIN in TS) | STT timestamps are smoothed and say nothing about voice; one runtime, ~100 ms per recording | Praat/parselmouth in a Python service if we need formants, jitter/shimmer or accent analysis |
| Paddle (MoR) | Handles global tax; available to Ukrainian sellers | Stripe if company entity is in a Stripe country |
| One Vercel project for two hosts (marketing `speakup.` / product `app.`), routed by host in `proxy.ts` | One build, one set of env vars, shared components and design tokens; the split can be switched on/off with two env vars | Two projects (or Next multi-zones) if the marketing site moves to a CMS/site builder or gets its own release cycle |
| ECS Fargate | Containers without managing servers; same images as local | Kubernetes (EKS) only with a platform team |
| Load tests with k6 + simulated AI providers (`ANALYSIS_PROVIDERS=fake`) on a throwaway copy of the prod stack (`SpeakUp-LoadTest`) | Measures our own system (API, S3, queue, worker, DB) at real scale for $0 in provider cost; fake latencies follow a log-normal so p99s stay realistic; same CDK code = same topology | A short real-provider run (budget-capped) to check provider rate limits; Grafana Cloud k6 for load from many regions/IPs |
| Results reach the page by long-polling (`GET /attempts/:id?wait=20`, woken by Redis pub/sub from the worker) | The result shows up the moment it's saved, a 10 s wait is 1–2 requests instead of ~7 polls, and it works with the existing bearer-token auth and React Query; nothing to stream through the ALB; k6 tests it unchanged | SSE (or WebSockets) if the page needs a continuous stream (live transcript); APNs/FCM push on mobile |
| Load-test sign-in = HMAC tokens limited to `loadtest_*` ids, refused in production without `LOAD_TEST_STACK=true` | Clerk tokens expire every 60 s and minting thousands would test Clerk, not us; the id prefix means a leaked secret can never act as a real user | Clerk testing tokens if Clerk ever offers bulk long-lived ones |
| Learning progress, streak, XP and lesson suggestions derived from the attempt history in the app (no progress tables); fine-grained problems from metrics by fixed rules (`detectProblems`) | Nothing new to keep in sync; deterministic, testable suggestions; content is still changing, so no schema churn | Progress tables (or a materialized view) when history gets long, lessons gain non-recorded steps that must sync across devices, or challenges/contests need server-side state |

---

## 15. Web funnel

### 15.1 Reference implementation (read this first)

The owner has a working, proven funnel in another project, **Holy Hush** (a Bible / AI-coaching app), located at:

```
C:\Users\tim20\Desktop\FPG
```

Before building M5.5:
1. Find the funnel in that project (look for the onboarding / quiz / funnel routes and their step components, the step config, the loader screens, the paywall).
2. Write a short `docs/funnel-reference.md` in this repo: how its step engine works, step types, how state is stored and restored, transitions/animations, loader behaviour, where auth and paywall sit, analytics events.
3. **Reuse the mechanics and the feel** (step engine, progress bar, transitions, loaders with questions, reflection screens, paywall layout), **not the content or branding**. All copy, questions and visuals here are about speaking and communication.
4. **Read-only:** never modify, move or copy secrets from that project. If it uses a library that fits our stack (e.g. framer-motion, Zustand), use the same one; otherwise adapt to our stack.
5. Where the reference conflicts with this section, this section wins (especially the anonymous recording + claim flow, which the reference may not have).

### 15.2 Step sequence

`/start/[step]`. Progress bar across the top for the pre-paywall part. Back button on every step except the loaders and the recording-in-progress state. Answers save on every step (local first, then `PATCH /v1/funnel/sessions/current`).

| # | Step id | Type | Content |
|---|---|---|---|
| 1 | `goal` | single choice | **What do you most want to improve?** Job interviews · Presentations & public speaking · Meetings & calls at work · Everyday conversations · Clarity & accent |
| 2 | `situations` | multi choice | **When do you feel least confident speaking?** In meetings · On calls / video · Speaking to a group · Small talk with strangers · When I'm put on the spot |
| 3 | `reflection-1` | reflection | Personalized from `goal`. E.g. for interviews: "Interviews reward clear, structured answers more than perfect English. That's a trainable skill." One sentence + subtle illustration + Continue |
| 4 | `language` | single choice | **Is English your first language?** Yes · No, I'm fluent · No, I'm intermediate · No, I'm still learning |
| 5 | `symptoms` | multi choice | **What happens when you get nervous speaking?** I talk too fast · I say "um", "like", "you know" · I lose my train of thought · My voice gets quiet · People ask me to repeat myself |
| 6 | `reflection-2` | reflection | Personalized from `symptoms` (first selected item). E.g. talking fast: "Speeding up is a nerves habit, not a skill gap. Your first exercise will measure your pace." |
| 7 | `self-rating` | slider 1–5 | **How would you rate your speaking confidence today?** (labels at 1 and 5) |
| 8 | `time` | single choice | **How much time can you practice per day?** 5 min · 10 min · 15 min · 20+ min |
| 9 | `mini-lesson` | video lesson | 45–60 s video (URL from `NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL`, placeholder for now) "How we'll measure your speaking: pace, pauses, filler words, clarity" + 3 bullet takeaways. Continue button activates after 10 s or at video end |
| 10 | `mic` | permission | Explain why we need the mic + privacy line ("Your recording is private and deleted if you don't create an account"). Request permission; handle denial with instructions per browser |
| 11 | `exercise` | recording | **Impromptu speaking check picked by the goal** (`check-<goal>`, e.g. "tell me about yourself" for interviews, a 30-second pitch for pitching; fallback `check-general`). Reading a text aloud is easy and hid the real problems; answering without a script shows hesitations, fillers, a flat voice and rambling. States: ready → 3-2-1 countdown → recording (timer, live level meter, max 45 s) → review (play back / re-record / submit). On submit: Turnstile → `POST /v1/funnel/attempts` → upload → submit. Analysis starts now |
| 12 | `auth` | auth gate | "Your analysis is being prepared. Create a free account to see your results." Clerk sign-up embedded (Google + email). A small live status line shows the analysis progressing. On success: `POST /v1/funnel/claim` |
| 13 | `results` | results | Same report component as `/results/[attemptId]`, funnel variant: score with animated count-up, 3 metric cards (pace vs target band, filler words, pauses), top 2 issues with tips, one strength. If analysis still running: staged loader ("Transcribing → Measuring pace → Writing your feedback") |
| 14 | `deadline` | single choice | **Do you have an important speaking moment coming up?** Within a week · Within a month · In a few months · No, just improving |
| 15 | `focus` | single choice | **What should we work on first?** Options generated from results: the top 2 issues + "Overall confidence" |
| 16 | `plan-loader` | loader with questions | "Building your personal plan" with progress 0→100% over ~12 s, checklist items ticking (Analyzing your recording ✓ · Matching lessons to your goal ✓ · Setting your daily practice ✓). At ~30% and ~65% the progress pauses and a modal asks a yes/no question: **"Do you practice speaking out loud now?"** · **"Would daily reminders help you stay consistent?"** Progress resumes after each answer |
| 17 | `plan` | plan summary | "Your 4-week plan": week-by-week focus derived from `goal`, `focus`, `time`; baseline score shown as the starting point. No promised outcomes or invented statistics |
| 18 | `paywall` | paywall | Plan recap at top, Pro monthly / yearly options (prices from config), what's included, FAQ (cancel anytime, privacy), Paddle checkout. Secondary "Continue with free plan" link → dashboard |

### 15.3 Funnel engine (implementation)

- **Config-driven.** `apps/web/funnel/config.ts` exports an ordered array of steps `{ id, type, ...typeSpecificProps, showIf?(answers) }`. Pages render by `type` via a component map. Adding/reordering steps = editing config only.
- **Step types:** `single_choice`, `multi_choice`, `slider`, `reflection`, `video_lesson`, `mic_permission`, `recording`, `auth_gate`, `results`, `loader_with_questions`, `plan_summary`, `paywall`.
- **State:** Zustand store persisted to `localStorage` (answers, current step, guest token, attemptId). Reload resumes where the user left off. Guest token never goes into URLs or logs.
- **Server sync:** create the funnel session on step 1; PATCH answers on each step (debounced, failures don't block the UI).
- **Guards:** you can't open a step whose prerequisites aren't met (e.g. `/start/results` without a claimed attempt redirects to the right step). Already-signed-in users who open `/start` skip `auth`.
- **Personalization text** (reflections, plan) comes from small pure functions in `funnel/personalize.ts`, unit-tested.
- **Copy rule:** no invented statistics or testimonials. Where the reference funnel uses social-proof numbers, put clearly marked `TODO(founder)` placeholders.
- **Transitions:** same style as the reference funnel (e.g. slide/fade between steps), respect `prefers-reduced-motion`.
- **Analytics hook:** `track(event, props)` wrapper (no vendor yet; logs in dev). Events: `funnel_step_viewed`, `funnel_answer`, `funnel_recording_submitted`, `funnel_signup_completed`, `funnel_results_viewed`, `paywall_viewed`, `checkout_started`.
- **Mobile-first layout:** the funnel is mostly opened on phones from ads.
