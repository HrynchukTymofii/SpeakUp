# Learning notes

One section per milestone (SPEC §13). Written to be re-read before technical interviews.

---

## M0 — Monorepo scaffold, local infra, env validation, tooling, CI

**What we built:**

- A pnpm-workspaces + Turborepo monorepo with three apps (`apps/web` Next.js, `apps/api` Fastify, `apps/worker` BullMQ) and one library (`packages/shared`).
- Local Postgres 16 + Redis 7 via `infra/docker-compose.yml`, with healthchecks.
- Zod-validated environment config in every app (`apps/api/src/env.ts`, `apps/worker/src/env.ts`, `apps/web/lib/env.ts`); the process exits at boot on bad config.
- API skeleton with helmet, CORS allowlist, request IDs, liveness `/health` and readiness `/health/ready` (pings Redis); a worker that consumes the `analysis` queue.
- ESLint (flat config), Prettier, Vitest tests, and a GitHub Actions CI workflow.

**Key concepts (explain like to a junior):**

- **Monorepo + workspaces** (`pnpm-workspace.yaml`): several packages in one git repo. `"@speakup/shared": "workspace:*"` in `apps/api/package.json` links the local package instead of downloading from npm, so a change to a shared schema is seen by web, API and worker immediately and one PR can change all three.
- **Turborepo task graph** (`turbo.json`): `"dependsOn": ["^build"]` means "before running this task in a package, build the packages it depends on". That's why `packages/shared` is compiled to `dist/` before the API typechecks or runs. Turbo also caches task results, so unchanged packages are skipped.
- **Env validation at boot** (`apps/api/src/env.ts`): `process.env` is just untyped strings. We parse it once with a Zod schema into a typed `Env` object (e.g. `API_PORT` becomes a number, `CORS_ORIGINS` becomes an array of URLs). If parsing fails, the process exits immediately — "fail fast" beats a confusing error on the first request in production.
- **Dependency injection for testability** (`apps/api/src/server.ts`): `buildServer({ env, redis })` receives its dependencies as arguments instead of importing globals. Tests pass a fake Redis object with a `ping()` method and use Fastify's `app.inject()` to send fake HTTP requests without opening a port (`apps/api/src/routes/health.test.ts`).
- **Liveness vs readiness** (`apps/api/src/routes/health.ts`): liveness = "the process is alive" (never checks dependencies, so a Redis blip doesn't make the orchestrator restart healthy containers); readiness = "I can serve traffic right now" (pings Redis, later Postgres). Load balancers use readiness to decide where to send requests.
- **Job queue / BullMQ** (`apps/worker/src/index.ts`, `packages/shared/src/queue.ts`): the API will put a small message (`{ attemptId }`) into a Redis-backed queue; a separate worker process takes jobs off it and does the slow work. The queue name and payload schema live in `shared` so the producer and consumer can't drift apart. Payloads are validated with Zod in the worker because Redis is a boundary too.
- **Graceful shutdown** (`index.ts` in api and worker): on `SIGTERM` (what ECS/Docker send before stopping a container) we stop accepting new work, let in-flight requests/jobs finish, then exit — so a deploy doesn't cut a user's analysis in half.

**Why this choice / alternatives:**

- **pnpm + Turborepo vs Nx / npm workspaces:** pnpm is fast and strict (packages can only import what they declare); Turborepo adds caching and task ordering with one small JSON file. Nx is more powerful (generators, project graph UI) but heavier to learn; plain npm workspaces lack caching and task ordering.
- **Compiling `shared` to `dist/` vs importing its TypeScript source directly:** importing `.ts` source is simpler in dev but plain `node dist/index.js` in production can't load `.ts`. Building it keeps dev and prod identical; the cost is a `tsc --watch` running during `pnpm dev`.
- **TypeScript 6.0 and ESLint 9 instead of the newest majors (TS 7, ESLint 10):** `typescript-eslint` only supports TS `<6.1`, and some React ESLint plugins don't support ESLint 10 yet. Pinning to versions the whole toolchain supports avoids broken lint in CI.

**Where it breaks at scale & what we'd do:**

- Turbo cache is local only; with a team and slow CI we'd enable remote caching (Vercel or self-hosted) so CI reuses results.
- One `.env` file for all apps is fine locally; in production each service gets only its own secrets from AWS Secrets Manager (least privilege — the web app should never see `ANTHROPIC_API_KEY`).
- A single Redis instance holds both the queue and (later) rate-limit counters; under heavy load we'd split them or move the queue to SQS (see SPEC §14).

**Likely interview questions:**

1. _Why put the API, web and worker in one repo?_ — Shared types/schemas across all of them, atomic changes in one PR, one CI. They still deploy independently.
2. _Why is the worker a separate process instead of doing the work in the API request?_ — Analysis takes 5–20 s and calls flaky external APIs; the API should answer instantly, and the worker can retry failed jobs and scale on its own.
3. _What happens if a required env var is missing in production?_ — `parseEnv` throws, `main()` prints the Zod error and exits with code 1, so the deploy fails health checks immediately instead of serving broken requests.
4. _Difference between liveness and readiness probes?_ — Liveness: restart me if this fails. Readiness: stop sending me traffic if this fails. Dependency checks belong only in readiness.
5. _Why does BullMQ need `maxRetriesPerRequest: null`?_ — The worker waits on Redis with blocking commands that can legitimately take a long time; with a retry limit, ioredis would abort those calls and throw errors.

---

## M1 — Prisma schema, migration, seed

**What we built:**

- `packages/db`: the full data model from SPEC §5 in `prisma/schema.prisma`, Prisma 7 config in `prisma.config.ts`, and a `createDbClient(url)` factory (`src/client.ts`) used by the API (and later the worker).
- The `init` migration (`prisma/migrations/*_init/migration.sql`) plus a hand-written CHECK constraint `Attempt_owner_check`: every attempt must belong to a user or a funnel session.
- An idempotent seed: content in `src/seed-data.ts` (1 course, 3 lessons with Lesson 1 free, 5 lesson exercises, plus the standalone 45 s `baseline` read-aloud), written to the DB by `prisma/seed.ts` with upserts in one transaction.
- `/health/ready` now checks Postgres (`SELECT 1`) as well as Redis, in parallel.
- Root scripts `pnpm db:migrate | db:migrate:deploy | db:seed | db:reset | db:studio | db:generate`.

**Key concepts (explain like to a junior):**

- **ORM + generated client** (`schema.prisma` → `src/generated/prisma`): we describe tables once in Prisma's schema language; `prisma generate` writes a fully typed TypeScript client from it. A typo like `db.lesson.findMany({ where: { titel: … } })` is a compile error, not a runtime bug. The generated folder is gitignored and rebuilt in `build`/`typecheck`.
- **Migrations** (`prisma/migrations`): versioned SQL files that move the DB schema from one state to the next. They are committed to git so every environment (laptop, CI, prod) gets exactly the same schema. `migrate dev` creates + applies them locally; `migrate deploy` only applies existing ones (what prod runs — it never generates or resets).
- **CHECK constraint** (end of the init migration): a rule enforced by Postgres itself. Even if a future bug in our code tries to insert an attempt with neither `userId` nor `funnelSessionId`, the DB refuses (we verified: `violates check constraint "Attempt_owner_check"`). Prisma can't express CHECKs in the schema, so we added it to the SQL by hand; Prisma ignores CHECKs when diffing, so later migrations won't remove it.
- **Indexes** (`@@index([userId, createdAt])` on `Attempt`): an index is a sorted lookup structure, like a book's index. "This user's attempts today, newest first" — used for both history and the daily quota — becomes a quick range scan instead of reading the whole table. Column order matters: equality column (`userId`) first, range/sort column (`createdAt`) second.
- **Unique constraint for idempotency** (`@@unique([source, eventId])` on `WebhookEvent`): the DB guarantees one row per payment-provider event, so a webhook delivered twice can be detected by the insert failing (used in M6).
- **Idempotent seed** (`prisma/seed.ts`): every row is `upsert`ed by its unique `slug` — "insert if missing, otherwise update". Running the seed twice gives the same result (verified: 3 lessons, 6 exercises both times), so editing lesson copy and re-seeding is safe.
- **Driver adapter** (`src/client.ts`): Prisma 7 no longer ships a Rust query engine binary; it sends SQL through a normal Node driver (`pg`) via `@prisma/adapter-pg`. Smaller deploys, and it works in more runtimes.

**Why this choice / alternatives:**

- **Prisma vs Drizzle vs raw SQL:** Prisma gives the most readable schema file and a very typed client plus a migration tool in one package. Drizzle is thinner and closer to SQL (nicer for complex queries); raw SQL is fastest to execute but has no type safety. We can drop to `$queryRaw` for hot paths.
- **`cuid()` string ids vs auto-increment integers:** cuids can be generated anywhere, don't reveal how many users/attempts we have, and can't be guessed by incrementing (`/attempts/124`). The cost is slightly bigger indexes.
- **Content in a seed file vs an admin CMS:** zero UI to build, content is code-reviewed and versioned. It stops working once non-developers need to edit lessons (that's when a CMS is worth it).

**Where it breaks at scale & what we'd do:**

- Each API/worker container opens its own connection pool; with many ECS tasks we could exhaust Postgres connections → put RDS Proxy / PgBouncer in front, or size pools per task.
- `Attempt` grows forever and `Json` columns (`metrics`, `feedback`, `words`) are big → partition by month or archive old transcripts to S3; keep only the denormalized `overallScore` hot.
- Migrations on a big table (e.g. adding an index) can lock writes → use `CREATE INDEX CONCURRENTLY` in a hand-edited migration and expand/contract patterns for column changes.

**Likely interview questions:**

1. _How do you change the DB schema safely in production?_ — Write a migration, review the SQL, apply it with `prisma migrate deploy` in the deploy pipeline before the new code starts. For breaking changes use expand → migrate data → contract over several deploys.
2. _Why enforce the "attempt has an owner" rule in the DB and not just in code?_ — Code has bugs and many code paths; the DB is the last line of defense and guarantees the invariant for every writer, including scripts and future services.
3. _What does the `[userId, createdAt]` index speed up, and why that column order?_ — Filtering by one user and a date range/sort. A composite index is used left-to-right: equality first, then range.
4. _What makes a seed script idempotent?_ — It converges to the same state no matter how often it runs: upsert by a natural unique key (slug) instead of blind inserts.
5. _Why is the Prisma client created by a factory instead of a global singleton?_ — The process entry point controls its lifecycle (create once, disconnect on shutdown), and tests can inject a fake.

---

## M2 — Clerk auth (web + API), `/v1/me`, lazy user provisioning, onboarding save

**What we built:**

- Web: Clerk sign-in/sign-up (`apps/web/app/sign-in/[[...sign-in]]`, `sign-up/...`), `proxy.ts` with `clerkMiddleware()`, a header with `<Show when="signed-in|signed-out">`, and a protected `/app` dashboard (`app/app/layout.tsx`) that shows the profile returned by the API (`app/app/profile-card.tsx`).
- A typed API client (`apps/web/lib/api.ts` + `lib/use-api.ts`) that attaches the Clerk session token and validates every response with the shared Zod schemas; TanStack Query for fetching/caching.
- API: `requireAuth` hook (`apps/api/src/plugins/auth.ts`) that verifies the Bearer JWT via an `AuthProvider` interface (Clerk adapter in `services/auth-provider.ts`), lazily creates the `User` row, and exposes `currentUser(request)`.
- `GET /v1/me` (profile + entitlements + today's usage) and `PUT /v1/me/onboarding` (`apps/api/src/routes/me.ts`), with request/response contracts in `packages/shared/src/api/me.ts`.
- A single error handler (`plugins/error-handler.ts`) producing `{ error: { code, message, requestId } }` for 400/401/404/500, and `getEntitlements()` implementing the SPEC §5 rule (`services/entitlements.ts`).

**Key concepts (explain like to a junior):**

- **JWT (JSON Web Token)** (`services/auth-provider.ts`): after sign-in, Clerk gives the browser a short-lived token signed with Clerk's private key. Our API checks the signature with Clerk's public key (fetched once, cached), the expiry, and the `azp` claim ("which website asked for this token" — must be one of our `CORS_ORIGINS`). If all pass, the `sub` claim tells us who the user is. No DB lookup or call to Clerk per request is needed to _verify_.
- **Bearer token vs cookies** (`lib/api.ts`): the web app sends `Authorization: Bearer <jwt>` to the API instead of relying on cookies. The API is on another origin, and the Expo app (no browser cookies) will authenticate exactly the same way. Bonus: no CSRF risk, because browsers never attach this header automatically.
- **Identity only from the verified token** (`plugins/auth.ts`): the user id is never read from the body or query. The onboarding schema is a `strictObject`, so even `{ answers: {}, userId: "victim" }` is rejected with 400 (tested in `routes/me.test.ts`).
- **Lazy provisioning** (`findOrCreateUser` in `plugins/auth.ts`): we don't sync users from Clerk via webhooks; the first authenticated request creates our `User` row. Fast path = one indexed `findUnique`; on first sight we fetch the email from Clerk and `upsert`, so two simultaneous first requests still end up with one row (unique `clerkUserId`).
- **Fastify encapsulation (scopes)** (`server.ts`): routes registered inside `app.register(async (authed) => …, { prefix: "/v1" })` share that scope's hooks. `requireAuth` adds an `onRequest` hook only there, so `/health` (and later webhooks/funnel routes in their own scopes) stays public. Using `onRequest` means unauthenticated requests are rejected _before_ the body is parsed or validated.
- **Ports & adapters** (`AuthProvider` interface): routes depend on a tiny interface, and only `auth-provider.ts` knows Clerk's SDK. Tests plug in `FakeAuth` (`src/testing/fakes.ts`); swapping Clerk for Cognito later touches one file.
- **UI guard vs real security** (`app/app/layout.tsx`): the redirect in the Next layout only improves UX. The security boundary is the API's token check — anyone can call the API without our UI.

**Why this choice / alternatives:**

- **Clerk vs own auth vs Cognito:** auth is security-critical (password hashing, MFA, OAuth, session revocation, bot protection); Clerk gives that plus ready UI and works for web + Expo. Cost per MAU and vendor lock-in are the trade-offs; Cognito is cheaper at scale but has a worse developer experience; own auth only with a dedicated reason.
- **`verifyToken` directly vs the `@clerk/fastify` plugin:** the plugin is less code, but verifying explicitly behind our own interface keeps the auth flow readable (one file), easy to fake in tests, and provider-agnostic.
- **Fakes vs a real DB in route tests:** fakes keep `pnpm test` fast and runnable in CI without Postgres; the trade-off is they don't prove our Prisma queries are right. Adding a few integration tests against a Postgres service container in CI is the next step when queries get complex.

**Where it breaks at scale & what we'd do:**

- Every authenticated request does one `User` lookup by `clerkUserId`. Cheap (unique index), but at high RPS cache `clerkUserId → user` in Redis/in-memory for a short TTL.
- Lazy provisioning means emails can go stale if users change them in Clerk → add a Clerk `user.updated` webhook when email matters (notifications).
- JWTs can't be revoked before expiry; Clerk keeps them very short-lived (~60 s) and refreshes in the background, which bounds that window. For sensitive actions, re-check the session server-side.

**Likely interview questions:**

1. _How does your API know who is calling?_ — It verifies the Clerk JWT from the `Authorization` header (signature, expiry, authorized party) and takes the user id from `sub`; then maps it to our `User` row, creating it on first sight.
2. _Why not trust `userId` from the request body?_ — The client controls the body; only the signed token proves identity. We also reject unknown fields so such attempts fail loudly.
3. _What's the difference between authentication and authorization here?_ — Authentication = valid token → we know who you are (401 if not). Authorization = are you allowed to do _this_ (entitlements, ownership checks → 402/403, coming in M3/M4).
4. _Why is the protected-page check in Next.js not enough?_ — It runs in our UI only; attackers call the API directly. Every API route must check the token itself.
5. _How do you test auth without real tokens?_ — Dependency injection: `buildServer` takes an `AuthProvider`; tests pass a fake that accepts `valid:<id>` tokens and use `app.inject()`.

**Debugging story (M2) — "Failed to fetch" on the dashboard:**

- _Symptom:_ the browser couldn't reach the API at all. The API process under `pnpm dev` was alive but had **no sockets** (not even Redis) — frozen during startup — while `tsx src/index.ts` (no watch) worked.
- _Method:_ bisection with tiny probe files run under `tsx watch` — fastify / ioredis / Clerk loaded fine, `@speakup/db` hung → generated Prisma `client.js` → removing one line at a time → the culprit was `import ... from "node:process"`. A two-line file with just that import reproduced the hang.
- _Root cause:_ a `tsx watch` bug on Windows (Node 22.15, tsx 4.23.15) with modules importing `node:process`; Prisma 7's generated client does exactly that.
- _Fix:_ use Node's built-in watcher with tsx only as a TypeScript loader: `node --watch --import tsx src/index.ts` (apps/api and apps/worker `dev` scripts).
- _Side fix found on the way:_ `tsc --watch` re-emitted every `dist/` file at startup, restarting the apps several times during boot; `incremental` + `tsBuildInfoFile` in `packages/*/tsconfig.build.json` stops that.
- _Lesson:_ when "it works when I run it directly but not in the dev runner", diff the two launch paths and bisect with the smallest possible repro instead of guessing (my first hypothesis — the restart storm — was real but not the cause).

**Clock skew:** JWTs carry `nbf`/`exp` timestamps, so a machine whose clock is off by more than a few seconds rejects valid tokens ("JWT cannot be used prior to not before date"). Fix the clock (NTP sync), don't widen the allowed skew.

---

## M3 — Courses & lessons API + UI, locking logic

**What we built:**

- `GET /v1/courses` (course → lessons with a per-user `locked` flag), `GET /v1/lessons/:slug` (body, video, exercises; `403 LESSON_LOCKED` if not in the plan, `404` if unknown), `GET /v1/exercises/baseline` — all in `apps/api/src/routes/courses.ts`.
- One access rule, `canAccessLesson(lesson, plan)` in `apps/api/src/services/access.ts`, used both to compute `locked` and to enforce the 403.
- Shared response contracts in `packages/shared/src/api/courses.ts` (validated on the API's way out and the web's way in).
- Web: course list on the dashboard (`app/app/course-list.tsx`, locked lessons visible but not linked) and the lesson page `app/app/lessons/[slug]` (video, markdown body via `react-markdown`, exercise cards, upgrade card on `LESSON_LOCKED`).

**Key concepts (explain like to a junior):**

- **Authorization vs authentication** (`routes/courses.ts`): M2 answered "who are you?" (401 if unknown). M3 answers "may you see this?" — a signed-in free user asking for a Pro lesson gets **403**: we know who they are, they just aren't allowed. Different status, different UI (upgrade prompt vs sign-in).
- **Enforce on the server, mirror in the UI** (`services/access.ts`): hiding the link to a locked lesson is UX; the real check is in the API, because anyone can call `/v1/lessons/power-of-the-pause` directly. Both places use the same function, so they can't disagree. The test `free user gets 403 … and no content leaks` checks the body isn't in the error response.
- **Explicit `select` = API contract at the DB layer** (`exerciseSelect` in `routes/courses.ts`): we fetch only the fields clients may see, instead of loading whole rows and deleting fields later. Internal columns (`lessonId`, `order`, `isFree` of a lesson) can't leak by accident, and the query moves less data.
- **Parallel independent queries** (`Promise.all` in `routes/courses.ts`): entitlements and lesson content don't depend on each other, so they run concurrently — the request takes as long as the slower query, not the sum.
- **Input validation on path params** (`SlugSchema`): `/v1/lessons/Bad_Slug!` is rejected with 400 before touching the DB.
- **Don't leak internals in 500s** (baseline route): a missing seed is a server bug — the client gets a generic `INTERNAL` message; the real reason ("run db:seed") goes only to our logs (tested).
- **Markdown safely** (`lesson-view.tsx`): `react-markdown` builds React elements and ignores raw HTML by default, so content can't inject `<script>` (vs `dangerouslySetInnerHTML`, which would).

**Why this choice / alternatives:**

- **`locked` computed by the API vs by the client:** the client could compute it from `isFree` + plan, but then the rule would live in two codebases (web + future mobile). The server sends the decision; clients just render it.
- **403 vs 402 for locked lessons:** SPEC uses 402 `PAYWALL` for _creating attempts_ (an action that needs payment) and 403 for _reading_ locked content. A distinct `code` (`LESSON_LOCKED`) lets the UI react precisely regardless of status.
- **Fakes for route tests + a one-off real-DB check:** route tests stay DB-free; the real Prisma `select`s were verified against the actual database (courses/lesson/403/baseline). A permanent integration-test suite with a Postgres container is the scalable version of that check.

**Where it breaks at scale & what we'd do:**

- Every course/lesson request re-reads mostly static content from Postgres → cache content in Redis (or HTTP-cache the public parts) and invalidate on re-seed; only the `locked` flags are per-user.
- `getEntitlements` runs on every content request → cache per user for a short TTL, invalidated by the Paddle webhook (M6).
- Videos served from a raw URL don't adapt to bandwidth → CloudFront + HLS (SPEC §5) with signed URLs for Pro-only videos.

**Likely interview questions:**

1. _401 vs 403?_ — 401: we don't know who you are (missing/invalid token). 403: we know, but you're not allowed (e.g. Pro lesson on a free plan).
2. _How do you make sure a locked lesson can't be read by calling the API directly?_ — The API checks entitlements on every lesson request and returns 403 without the body; the UI lock is cosmetic.
3. _Why select specific columns instead of whole rows?_ — Least data exposure, smaller payloads, and the query documents exactly what the endpoint returns.
4. _How would you add a "trial unlocks Lesson 2" rule?_ — Change `canAccessLesson` (and entitlements); both the list and the endpoint follow automatically.
5. _How do you render user-editable markdown safely?_ — Use a renderer that produces elements and disallows raw HTML (react-markdown default); never `dangerouslySetInnerHTML` with unsanitized input.

## M4 — Recorder, attempt creation, S3 pre-signed upload, submit, enqueue

**What we built:**

- `POST /v1/attempts` (access + daily quota check → `Attempt(awaiting_upload)` → pre-signed S3 POST), `POST /v1/attempts/:id/submit` (verify file in S3 → `queued` → BullMQ job), `GET /v1/attempts/:id` — in `apps/api/src/routes/attempts.ts`.
- Two small service interfaces with real + fake implementations: `Storage` (`services/storage.ts`, AWS SDK v3) and `AnalysisQueue` (`services/analysis-queue.ts`, BullMQ).
- Shared contracts in `packages/shared/src/api/attempts.ts` (audio type allowlist, size limits, request/response schemas) + new error codes `PAYWALL`, `QUOTA_EXCEEDED`, `WRONG_STATE`, `UPLOAD_MISSING`.
- Web: `useRecorder` hook (`apps/web/lib/use-recorder.ts`) and `ExerciseRecorder` component (`apps/web/components/exercise-recorder.tsx`) on every lesson exercise: permission → timer with auto-stop → preview → re-record or submit.
- Local S3 via LocalStack in `infra/docker-compose.yml` (bucket created by `infra/localstack/init-s3.sh`: private, encrypted, CORS for the web origin).
- Real AWS dev bucket in `us-east-1` (private, SSE-S3, CORS for `localhost:3000`, lifecycle rule `expire-abandoned-uploads`) with a least-privilege IAM user. Uploads are signed with the tag `upload-status=pending`; submit removes it (`Storage.markSubmitted`). Verified against real S3: upload 204, upload without the tag 403, <1 KB rejected, other origins fail CORS, writes outside `recordings/` denied.

**Key concepts (explain like to a junior):**

- **Pre-signed POST** (`services/storage.ts`): the API signs a small "policy" with its AWS credentials — _this key, this Content-Type, 1 KB–10 MB, valid 5 minutes_ — and gives it to the browser. The browser uploads directly to S3; S3 checks the signature and every condition. The browser never sees AWS credentials, and the audio never passes through our API (no bandwidth/memory cost there). We verified that S3 really rejects a tampered Content-Type with 403.
- **Never trust the client's "I uploaded it"** (`submit` route): before queueing, the API does a `HeadObject` (metadata only, no download) to confirm the file exists and its size is within limits.
- **Idempotency** (`submit` route + `jobId`): a retried submit (lost response, double click) returns `202` with the current state instead of an error, and never creates a second job. Two layers: (1) a **conditional update** `UPDATE … WHERE id = ? AND status = 'awaiting_upload'` — only one concurrent request can win the transition, the other sees `count = 0`; (2) BullMQ `jobId = attemptId` — adding a job whose id already exists is a no-op.
- **Optimistic locking without a lock** (same `updateMany`): instead of locking the row, we let the database check the expected state as part of the write. Cheap and race-safe for a single-row state machine.
- **Compensating action** (`submit` route): if Redis is down after we've set `queued`, we put the attempt back to `awaiting_upload` so the client can simply retry. Otherwise it would sit "queued" forever with no job behind it. (Tested with a failing fake queue.)
- **402 vs 403 vs 429**: 402 `PAYWALL` = this _action_ needs a paid plan (recording a Pro exercise); 403 = reading locked content; 429 `QUOTA_EXCEEDED` = plan allows it, but not more today.
- **404 for someone else's attempt** (`findOwnedAttempt`): returning 403 would confirm the id exists; 404 reveals nothing.
- **Dependency injection for testability** (`ServerDeps` in `server.ts`): routes depend on `Storage`/`AnalysisQueue` interfaces. Tests pass in-memory fakes (`testing/fakes.ts`), production passes S3/BullMQ. The fake `updateMany` honours the `where` like Postgres does, so the race-safety logic is genuinely tested.
- **Lifecycle rules + object tags for cleanup** (`services/storage.ts`): S3 can delete objects automatically, filtered by prefix and tag. We tag every upload `upload-status=pending` _in the signed policy_ (so the browser can't leave it out), and remove the tag when the attempt is submitted. Abandoned uploads expire after 1 day; submitted recordings are untouched. No cron job, no DB scan.
- **Least privilege IAM**: the dev key can only touch `<bucket>/recordings/*`. A leaked key can't list other buckets, delete the bucket or read anything else. `ListBucket` (limited to the prefix) is granted only so `HeadObject` on a missing key returns 404 instead of 403. Without it, S3 hides whether the object exists.
- **Region choice**: put storage, DB and compute in the same region (every API request talks to all three); pick it by where most users are (US → `us-east-1`). GDPR doesn't forbid US storage for EU users. It needs a legal basis for the transfer (EU–US Data Privacy Framework / SCCs) and a privacy policy that lists processors.
- **MediaRecorder + format detection** (`use-recorder.ts`): Chrome/Firefox record WebM/Opus, Safari only MP4/AAC — we pick the first type `MediaRecorder.isTypeSupported()` accepts. Mic stream, timer and object URLs live in refs and are always released (else the browser's "mic in use" light stays on).

**Why this choice / alternatives:**

- **Pre-signed POST vs pre-signed PUT:** PUT URLs can't enforce a size range; POST policies can (`content-length-range`). For user uploads that cost us money downstream, the size cap at the S3 edge matters.
- **We generate the attempt id (UUID) instead of the DB's cuid:** the S3 key `recordings/{userId}/{attemptId}.webm` must exist before the row is inserted; generating the id first avoids an insert-then-update. Trade-off: two id formats in one schema.
- **LocalStack vs a real dev bucket:** LocalStack needs zero AWS setup; the same code runs against real S3 by clearing `S3_ENDPOINT`. We switched dev to a real bucket because emulators differ in edge cases (IAM, lifecycle, CORS) and M5 needs real audio anyway. LocalStack stays as an offline option.
- **Tag-based lifecycle vs a cleanup cron:** a cron would list `awaiting_upload` rows and delete their objects; that needs code, scheduling and S3 delete permissions in a job. The lifecycle rule is declarative and free. Trade-off: the 1-day granularity is fixed, and the DB rows still need their own cleanup.

**Where it breaks at scale & what we'd do:**

- The quota check counts then inserts — two simultaneous creates can both pass at the limit. Fine for 3/day; at scale use an atomic Redis counter (`INCR` with a TTL until midnight) or a DB constraint.
- An abandoned attempt (created, never uploaded) counts towards the daily quota and leaves no S3 object. Fix: count only submitted attempts _and_ re-check at submit, plus a cleanup job for stale `awaiting_upload` rows (the S3 lifecycle rule already removes their orphaned objects).
- If enqueueing fails after the tag was removed and the user never retries, that one object is kept forever. Rare; a periodic sweep of `awaiting_upload` rows older than a day would delete it.
- Polling `GET /v1/attempts/:id` every 1.5 s (M5) from many clients → push status via SSE/WebSocket, or long-polling.

**Likely interview questions:**

1. _How do users upload large files without going through your servers?_ — Pre-signed URL/POST: the server signs a short-lived, narrowly-scoped permission; the client uploads straight to object storage; the server then verifies the object exists before processing.
2. _How do you prevent duplicate processing if the client submits twice?_ — Conditional state transition in the DB (only one request moves `awaiting_upload → queued`) and a deterministic job id (`jobId = attemptId`) so the queue deduplicates.
3. _What happens if Redis is down when you enqueue?_ — The request fails with 500, and we roll the attempt back to `awaiting_upload` so a retry works. A stronger pattern is the **transactional outbox**: write the "job to enqueue" in the same DB transaction and have a relay push it to the queue.
4. _How do you stop someone uploading a 2 GB file or an HTML page to your bucket?_ — The signed policy fixes key, Content-Type and size range; S3 enforces them. The API also allowlists audio types and re-checks size on submit.
5. _Why return 404 instead of 403 for another user's attempt?_ — So attackers can't learn which ids exist (enumeration).
6. _How do you clean up files users uploaded but never used?_ — Tag them as pending at upload (enforced by the signed policy), remove the tag on confirm, and let an S3 lifecycle rule expire tagged objects after N days.
7. _Why shouldn't you use the AWS root account / long-lived keys?_ — Root can't be restricted by policies. Day-to-day work uses an IAM admin with MFA, apps use narrowly scoped IAM users locally and IAM roles (temporary credentials) in production.

## M5 — Worker: Deepgram → metrics → Claude → results page

**What we built:**

- The real `analyze` job in `apps/worker/src/pipeline.ts`: load attempt → `processing` → speech-to-text → metrics → AI feedback → save `Transcript` + `Analysis` → `completed` (or `failed` with an error code).
- `SttProvider` interface + Deepgram implementation over its REST API (`providers/stt.ts`, `providers/deepgram.ts`). `PronunciationProvider` is an interface only (SPEC §6.4).
- Pure metric functions in `apps/worker/src/metrics/`: speaking time, WPM, pauses (>0.5 s, long >1.5 s), filler words, low-confidence words, and read-aloud accuracy via word-level alignment.
- Claude feedback in `apps/worker/src/feedback/`: static system prompt with `PROMPT_VERSION` (`prompt.ts`), SDK call with structured output (`claude.ts`), validation + one fix-up retry (`index.ts`), cost estimate (`cost.ts`).
- `AnalysisRepo` (`repo.ts`): every DB read/write of the pipeline behind one interface, so the pipeline is tested with an in-memory fake.
- Shared contracts in `packages/shared/src/analysis.ts`: `MetricsSchema`, `FeedbackSchema`, `TranscriptSchema`, error codes.
- API: `GET /v1/attempts/:id` now returns `stage`, the exercise and (when completed) transcript + metrics + feedback.
- Web: `/results/[attemptId]` polls every 1.5 s (max 60 s) with real progress steps; `ResultsReport` + `TranscriptView` components; the recorder redirects there after submit; baseline speaking check on the dashboard.

**Key concepts (explain like to a junior):**

- **Idempotent jobs** (`pipeline.ts`): queues deliver _at least once_, so a job can run twice (retry, crash, stalled worker). The job checks "already completed? → exit", reuses a transcript saved by an earlier run (no second STT bill), and only uses upserts. Running it twice gives the same result as running it once.
- **Retryable vs permanent errors** (`errors.ts`, `index.ts`): `PipelineError` carries `retryable`. Timeouts/429/5xx → BullMQ retries with exponential backoff. A silent recording, a bad API key or invalid audio → `UnrecoverableError`, fail now (retrying wastes money). On the **last** attempt even a retryable error marks the attempt `failed`, so the UI stops polling.
- **Edit distance on words** (`metrics/read-aloud.ts`): the classic Levenshtein dynamic-programming table, but each cell compares words, not characters. Backtracking through the table yields matches, substitutions, missed and inserted words. Substitution costs a bit more (3) than a miss/insert (2), so correctly read words stay lined up — the way a teacher would mark it. (A unit test caught the ambiguity with equal costs.)
- **Structured output** (`feedback/claude.ts`): the API constrains the model's reply to our JSON schema. We still validate with Zod (`FeedbackSchema`) because some rules (score 0–100, max 4 issues) are stricter than what the API enforces. If validation fails we send the model its own answer plus the error once; a second failure → `LLM_INVALID_OUTPUT`.
- **Prompt caching** (`feedback/prompt.ts`): the system prompt is byte-for-byte identical on every request and sent with `cache_control`. Everything that varies (exercise, metrics, transcript) goes in the user message, _after_ the cached prefix. Caveat: a prefix shorter than the model's minimum cacheable length simply isn't cached — `usage.cache_read_input_tokens` shows whether it works.
- **Prompt injection defense** (`prompt.ts`): the transcript is user input. It's wrapped in `<transcript>` delimiters, angle brackets are stripped from spoken words so nobody can "close" the tag by speaking, and the system prompt says to treat it as data. The model gets only numbers we computed and must cite only those.
- **Pure functions for business logic** (`metrics/`): no I/O, no clock, no randomness → fast unit tests with hand-made transcripts.
- **Polling with a stop condition** (`results-view.tsx`): TanStack Query's `refetchInterval` returns `false` once the attempt is completed/failed, and a 60 s timer stops it for stuck jobs (with a "Check again" button).

**Why this choice / alternatives:**

- **Deepgram REST instead of its SDK:** one POST with 4 query parameters; `fetch` + a Zod schema of the response is less code than an SDK and one dependency fewer. (For Claude we use the official SDK: typed errors, built-in retries, structured-output helpers.)
- **`punctuate` but not `smart_format`:** smart formatting turns "twenty" into "20", which would count as a reading mistake against the reference text.
- **`filler_words=true`:** without it Deepgram _removes_ "um"/"uh" and our filler metric would always be 0.
- **Structured outputs instead of a forced tool call (deviation from SPEC §6.3):** current Claude models reject a `tool_choice` that forces a specific tool. Structured outputs give the same guarantee (reply matches a JSON schema). They also reject a custom `temperature`; `effort: "medium"` is the cost/latency knob instead.
- **Model `claude-sonnet-5-5` (SPEC default):** feedback on a 45-second recording doesn't need the biggest model, and Sonnet costs about half of Opus. Configurable via `ANTHROPIC_MODEL`.
- **Server-side fallbacks** (`fallbacks: "default"`): if a safety classifier declines a request, the API re-runs it on a fallback model inside the same call instead of failing the job.
- **Conservative filler detection:** "like"/"so" count only when isolated by pauses on both sides. False positives ("you said 'like' 10 times" when you didn't) destroy trust faster than missed fillers.
- **Pre-signed GET for Deepgram (SPEC):** the bucket stays private; Deepgram gets a 10-minute read-only link to one file. Alternative: the worker streams the bytes to Deepgram (no URL leaves our system, but every file passes through the worker).
- **`stage` computed by the API:** "transcribing" vs "analyzing" comes from whether a transcript row exists — real progress, no fake timers.

**Where it breaks at scale & what we'd do:**

- Polling: 1,000 waiting users ≈ 670 status requests/s. → Server-Sent Events/WebSocket push, or long-polling.
- Two external APIs per job: their rate limits cap throughput. → Per-provider concurrency limits (BullMQ rate limiter), queue priorities (paid users first), the Batch API for non-urgent re-analysis.
- The cost estimate uses list prices from env; fallbacks or price changes make it drift. → Reconcile monthly against the providers' usage/cost reports.
- Prompt changes silently shift score distributions. → `promptVersion` is stored on every row; build an eval set of recordings and compare versions before rollout.
- WPM and pauses come from STT word timestamps — approximations, fine for coaching, not for scientific measurement.

**Likely interview questions:**

1. _How do you make a background job safe to run twice?_ — Check state first (skip if done), make side effects idempotent (upserts, conditional updates), reuse intermediate results, use deterministic job ids.
2. _Which errors do you retry?_ — Transient ones (timeouts, 429, 5xx) with exponential backoff; never permanent ones (400, invalid input, no speech). On the final attempt, record the failure so clients stop waiting.
3. _How do you get reliable JSON from an LLM?_ — Structured outputs / tool schemas, then validate with your own schema anyway; on failure re-ask once with the validation errors; cap retries; version the prompt.
4. _How do you defend against prompt injection when the input is user speech?_ — Delimit user content, strip delimiter characters, tell the model it's data, give it only computed facts, validate the output shape.
5. _How would you compare a read text against the original?_ — Normalize both, then word-level edit distance (Levenshtein) with a backtrace listing missed/substituted/inserted words. O(n·m), fine for paragraphs.
6. _How do you keep LLM costs under control?_ — Smallest model that's good enough, prompt caching for the static prefix, cap input length, per-user quotas, store estimated cost per request, provider-side spend limit.

## M5.5 — Web funnel: anonymous baseline, claim on sign-up, Turnstile, cleanup

**What we built:**

- `docs/funnel-reference.md`: how the reference funnel (Holy Hush) works — step engine, state, transitions, loader with questions, paywall layout, analytics — and what we do differently.
- Shared contracts (`packages/shared/src/funnel.ts`): answer options (values + labels) used by both web and API, `FunnelAnswersSchema` (strict), request/response schemas, new error codes `BOT_CHECK_FAILED`, `RATE_LIMITED`.
- API (`apps/api/src/routes/funnel.ts`): `POST /v1/funnel/sessions`, guest-token routes `PATCH /funnel/sessions/current`, `GET /funnel/exercise`, `POST /funnel/attempts`, `POST /funnel/attempts/:id/submit`, `GET /funnel/attempts/:id` (status only), and the signed-in `POST /funnel/claim`. Guest auth hook in `plugins/guest-auth.ts`; services `guest-token.ts`, `bot-check.ts` (Turnstile), `rate-limiter.ts` (Redis).
- Refactor: the attempt lifecycle (create + pre-signed upload, verify + submit + enqueue) moved to `services/attempt-lifecycle.ts`, used by both `/attempts` and `/funnel/attempts`.
- Worker: daily cleanup job (`apps/worker/src/cleanup.ts`) on a `maintenance` queue via a BullMQ job scheduler.
- Web: config-driven funnel in `apps/web/funnel/` — `config.ts` (18 steps), `types.ts`, `engine.ts` (guards, progress), `personalize.ts`, Zustand `store.ts` (localStorage), `analytics.ts`, guest `api.ts`, `turnstile.tsx`, one component per step type in `steps/`, and `funnel-shell.tsx` (progress bar, back, transitions, server sync). Pages `/start` and `/start/[step]`; landing CTA.

**Key concepts (explain like to a junior):**

- **Guest tokens** (`services/guest-token.ts`): an anonymous visitor gets 32 random bytes as a bearer secret (`Authorization: Guest …`). The DB stores only its SHA-256 — like a password hash, so a DB leak doesn't hand out sessions. A plain (unsalted) hash is fine here because the token is random and long: there's nothing to guess.
- **HMAC for IPs** (`hashIp`): a plain hash of an IPv4 address can be reversed by hashing all ~4 billion addresses. HMAC with a server secret can't be, yet still lets us count "requests from the same IP".
- **Claim = ownership transfer in one transaction** (`funnelClaimRoutes`): the session gets `userId`, its attempts get `userId`, the answers are copied into `User.onboarding` — all or nothing. Idempotent for the same user, 409 for a different one. The DB CHECK (userId OR funnelSessionId) keeps the attempt valid at every moment.
- **Defense in depth for anonymous spend:** Turnstile (is it a human?) → one baseline per session → per-IP daily limit (Redis INCR, atomic across API instances) → 45 s cap → results only after sign-up (no free anonymous analyses to scrape).
- **Fixed-window rate limiting** (`rate-limiter.ts`): `INCR key` + `EXPIRE key 86400 NX` in one MULTI. Simple, atomic, shared by all API containers. Trade-off: bursts at window edges (sliding windows fix that; not needed for "3 per day").
- **Config-driven UI** (`funnel/config.ts` + `steps/index.tsx`): a mapped type `{ [T in StepType]: Component<StepProps<T>> }` makes the compiler check that every step type has a component and that each component gets its own config shape.
- **Guards from state, not from navigation history** (`engine.ts`): "the furthest step you may open = the first step not done". Typing `/start/results` without a claimed attempt redirects there. Pure function → unit-tested.
- **Client-only rendering for localStorage state** (`app/start/funnel-client.tsx`): `next/dynamic` with `ssr: false`, so the server never renders HTML that disagrees with the browser's saved state (no hydration mismatch).
- **Scheduled jobs in Redis, not in-process cron** (`worker/src/index.ts`): `upsertJobScheduler` stores the schedule in Redis; with 3 worker containers the cleanup still runs once a day, and restarts don't duplicate it.
- **Delete order for consistency** (`cleanup.ts`): DB rows first (guarded by "still unclaimed"), then S3 objects. A failure leaves orphan files (cheap, logged), never a row pointing at deleted audio.

**Why this choice / alternatives:**

- **Zustand + localStorage (SPEC) vs the reference's sessionStorage:** localStorage survives closing the tab, so someone who leaves before signing up can come back to their recording. Trade-off: shared computers keep the state (the guest token can only read status, never results).
- **Guest token in the body for `/claim`:** the `Authorization` header already carries the Clerk token. Alternative: a custom header — the body keeps it out of proxy logs that record headers.
- **Re-take before submit deletes the unsubmitted attempt** instead of reusing it: a new format (webm vs mp4) means a new S3 key; the old upload still has the "pending" tag, so the lifecycle rule removes it.
- **Structured personalization in pure functions** (`personalize.ts`) instead of LLM-written copy: predictable, free, testable, and no invented claims.
- **Paywall without checkout yet:** the layout, plan cards and `checkout_started` event exist now; Paddle plugs into the one button in M6. Prices are `TODO(founder)` placeholders.

**Where it breaks at scale & what we'd do:**

- Per-IP limits punish shared networks (offices, universities, mobile carrier NAT) and are bypassed with rotating IPs. → Combine signals (Turnstile score, device fingerprint, session age), raise limits for good reputations.
- Anonymous sessions accumulate (bots, bounced visitors). The daily cleanup handles volume; at scale, partition or TTL-index them and archive aggregates for analytics.
- localStorage-only progress doesn't follow the visitor across devices. → Resume links by email (after sign-up) or server-side session restore by token.
- Funnel analytics are console logs. → A vendor (PostHog/GA4) behind `track()`, plus server-side events for conversion truth (claim, checkout) that ad blockers can't hide.

**Likely interview questions:**

1. _How do you let anonymous users do something expensive without getting abused?_ — Bot check, per-session and per-IP limits in a shared store, hard caps on input size/length, and keep the valuable output behind sign-up.
2. _How would you store a session token securely?_ — Random 256-bit token, store only its hash, send it in a header (not URLs), short scope (it can't read results), expire/clean up unclaimed sessions.
3. _How do you move anonymous data to an account after sign-up?_ — A claim endpoint that requires both proofs (account token + guest token), runs in one transaction, is idempotent, and rejects claims by a different account.
4. _How do you run a cron job when you have several instances?_ — Store the schedule in a shared system (BullMQ job scheduler in Redis, EventBridge, a DB lock) so exactly one instance runs it.
5. _Why render the funnel client-only?_ — Its state lives in localStorage; server-rendered HTML would differ from what the browser restores, causing hydration mismatches and flicker.

## M6 — Paddle checkout, webhooks with idempotency, entitlements, quotas, paywall

**What we built:**

- `PaymentProvider` interface (`apps/api/src/services/payments/types.ts`) and its Paddle implementation (`paddle.ts`, official Node SDK): checkout data, customer portal link, webhook verification + normalization into our own `NormalizedEvent`.
- `processWebhookEvent` (`webhook-processor.ts`): idempotency via `WebhookEvent(source, eventId)`, subscription upsert in the same transaction, out-of-order protection with the new `Subscription.lastEventAt` column (migration `subscription_last_event_at`).
- Routes: `POST /v1/webhooks/paddle` (raw body, signature-verified), `GET /v1/billing/plans` (public), `POST /v1/billing/checkout`, `POST /v1/billing/portal`; `/v1/me` now includes a subscription summary.
- Quota rule: attempts that failed on our side don't count; NO_SPEECH does (`services/usage.ts`).
- Web: Paddle.js singleton (`lib/paddle.ts`), `UpgradeButton` (overlay checkout → waits for the webhook), `ProPrice` (Paddle's localized price), `/pricing`, `/app/billing` (status + customer portal), and upgrade links on locked lessons, plan-limit errors, the profile card and the funnel paywall.

**Key concepts (explain like to a junior):**

- **Webhooks are the source of truth** (`billing.ts` comments): the browser saying "payment succeeded" can be faked or lost (closed tab). Only Paddle's signed server-to-server webhook changes entitlements. The UI just polls `/v1/me` until the API reports Pro.
- **Signature verification on the raw body** (`routes/webhooks.ts`): Paddle signs `timestamp:body` with HMAC-SHA256. We must verify the exact bytes, so this route uses a raw-string body parser (only in its Fastify scope). Re-serialized JSON would differ by a space and fail. The timestamp check (5 s by default in the SDK) stops replaying a captured request later.
- **Idempotency key = the provider's event id** (`webhook-processor.ts`): Paddle retries until it gets 2xx, and you can replay events by hand. Inserting `WebhookEvent(source, eventId)` with a unique index first means a second delivery hits a unique violation (Prisma `P2002`) → we answer 200 and do nothing. Because the insert and the subscription upsert share one transaction, a crash halfway rolls both back and the retry processes the event properly.
- **Out-of-order delivery** (`lastEventAt`): `subscription.updated` can arrive before `subscription.created`. We store the `occurred_at` of the newest event applied and ignore older ones, so stale data never overwrites fresh data.
- **Normalize at the edge** (`PaymentProvider`): routes and DB code only know our vocabulary (`active/trialing/past_due/canceled`, `free/pro`). Adding Stripe or RevenueCat = one new provider file. Paddle's `paused` maps to `canceled` because both mean "no access".
- **customData as the join key**: the checkout passes `{ userId }` (from the verified Clerk token, never from the client), Paddle echoes it on every webhook. Events without it (e.g. created by hand in the dashboard) are recorded but not applied.
- **Merchant of record**: Paddle is the legal seller, so it calculates and remits VAT/sales tax worldwide and handles invoices; we receive payouts. That's why the price shown comes from Paddle (`PricePreview`), localized per visitor.
- **Fail-safe config** (`env.ts`): billing is optional in dev (routes answer 503 `NOT_CONFIGURED`), but the API refuses to start in production without the Paddle keys.

**Why this choice / alternatives:**

- **Paddle (SPEC) vs Stripe:** Paddle is a merchant of record and onboards sellers from Ukraine; Stripe would need a company in a supported country and our own tax handling (or Stripe Tax). The `PaymentProvider` interface keeps a Stripe adapter possible later.
- **Overlay checkout (Paddle.js) vs hosted checkout link:** no redirect, the visitor stays in the funnel; Paddle still handles card data (we never touch it, so PCI scope stays minimal).
- **Polling `/v1/me` after checkout vs trusting `checkout.completed`:** the event only says the payment UI finished. Entitlements must come from the webhook, so we wait for the API to agree (usually seconds).
- **Customer portal vs our own "cancel" button:** the portal handles card updates, invoices and cancellation rules for us. Less code, fewer billing edge cases.
- **`lastEventAt` column vs comparing `updatedAt`:** `updatedAt` is our write time, not Paddle's event time; only the provider's `occurred_at` orders events correctly.

**Where it breaks at scale & what we'd do:**

- The webhook does DB work inline. Under a burst (mass renewals) it could slow down → acknowledge fast and process from a queue (store raw event, BullMQ job), still idempotent by event id.
- `getEntitlements` queries subscriptions on every request → cache per user in Redis, invalidated by the webhook.
- If a webhook is permanently lost, the account stays out of sync → a nightly reconciliation job that lists subscriptions from Paddle's API and fixes differences.
- One price id in env → a `Plan` table (or Paddle catalog sync) when there are yearly plans, regional prices or experiments.

**Likely interview questions:**

1. _How do you make webhook processing idempotent?_ — Store the provider's event id under a unique constraint in the same transaction as the side effects; on a duplicate, return 2xx and do nothing.
2. _Why verify the signature against the raw body?_ — The HMAC is over the exact bytes; parsing and re-serializing changes them. Also check the timestamp to block replays.
3. _A user paid but isn't Pro yet — why, and how do you handle it?_ — The webhook hasn't arrived/processed yet (or failed). The UI waits and polls; the provider retries failed deliveries; a reconciliation job is the backstop.
4. _How do you handle out-of-order webhooks?_ — Keep the provider's event timestamp on the record and ignore older events (or always re-fetch the latest state from the provider's API).
5. _What's a merchant of record?_ — The company legally selling to the customer: it collects and remits taxes, handles chargebacks and invoices. Paddle/Lemon Squeezy are MoRs; Stripe is a payment processor (you're the seller).

## M7 — Hardening: rate limits, error handling, logging, NO_SPEECH, tests

**What we built:**

- Global per-IP rate limit with `@fastify/rate-limit` on Redis (`apps/api/src/server.ts`): `RATE_LIMIT_PER_MINUTE` (300), standard 429 body + `Retry-After`; health checks and provider webhooks opt out.
- Per-user limit on `POST /v1/attempts` (`ATTEMPTS_PER_MINUTE`, 10), keyed by the verified user id, using our Redis `RateLimiter`.
- Error handler (`plugins/error-handler.ts`): Fastify's internal errors mapped to our stable codes (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`…); `AppError` can carry headers; 100 KB body limit.
- Log redaction shared by API and worker (`packages/shared/src/logging.ts`): emails, tokens, transcripts, audio URLs, upload fields, auth headers and Paddle signatures are replaced with `[redacted]` by the logger itself.
- Request id travels with the job (`AnalyzeJobData.requestId`) → worker logs carry the API's request id.
- Crash safety: `unhandledRejection` / `uncaughtException` → log fatal + exit (the orchestrator restarts the container).
- Tests (`apps/api/src/hardening.test.ts`, `apps/worker/src/logger.test.ts`, more NO_SPEECH cases): rate limits, error shapes, redaction (incl. a developer logging an email by mistake), request-id handover, silent and filler-only recordings.

**Key concepts (explain like to a junior):**

- **Layered rate limits**: a cheap, broad per-IP limit protects the whole API from floods; a narrow per-user limit protects the expensive action (recording → STT + LLM). Per-IP alone punishes shared networks and is bypassed by rotating IPs; per-user alone does nothing for anonymous routes. Daily quotas (M6) sit on top as the business limit.
- **Shared state for limits**: with 3 API containers, an in-memory counter gives each its own limit (3× the intended rate). Redis makes the counter global. `skipOnError` chooses availability over strictness if Redis is down.
- **Fail-safe defaults by design, not discipline** (`logging.ts`): redaction at the logger means a careless `log.info({ email })` can't leak. The test logs an email on purpose and checks it never reaches the output.
- **Stable error contract** (`error-handler.ts`): clients switch on `error.code`. Fastify's internal codes (`FST_ERR_…`) can change between versions, so we translate them by status; the internal code stays in our logs.
- **Correlation ids** (`requestId` in the job): one id from the HTTP request through the queue into the worker, so "my recording failed" can be traced across processes.
- **Crash-only design** (`index.ts` handlers): after an unexpected error the safest thing is to exit and let the orchestrator start a clean process; BullMQ re-delivers jobs from a dead worker ("stalled" jobs).

**Why this choice / alternatives:**

- **`@fastify/rate-limit` (SPEC) vs our own limiter everywhere:** the plugin handles headers (`X-RateLimit-*`, `Retry-After`), per-route config and the Redis store; our small `RateLimiter` stays for the business-specific limits (per user, per IP-day in the funnel) where we pick the key.
- **Limits at the API vs at the edge (CloudFront/WAF, Cloudflare):** an edge WAF stops floods before they cost compute; the API limit still matters because it knows the user. In production we'd use both.
- **Fixed windows vs sliding windows/token bucket:** fixed windows are simplest and good enough here; they allow up to 2× bursts at a window boundary. A token bucket smooths that if needed.
- **Exit on unhandled errors vs log-and-continue:** continuing may leave connections or state half-broken in ways that are hard to detect; restarting is predictable.

**Where it breaks at scale & what we'd do:**

- Behind a proxy, `request.ip` must come from `X-Forwarded-For` (`trustProxy` in production). Trusting it without a proxy would let clients spoof IPs; with several proxy hops, configure the exact hop count.
- One Redis for queue, limits and rate counters is a single point of failure → ElastiCache with a replica (M8), or separate clusters for queue vs cache at larger scale.
- Logs are redacted but still contain user ids and IPs (personal data under GDPR) → retention limits and access control on the log store.
- Global limit of 300/min/IP may hit corporate NAT users → raise limits for signed-in users, or key by user id once authenticated.

**Likely interview questions:**

1. _How would you rate-limit an API that runs on several instances?_ — A shared counter (Redis INCR + expiry, or a token bucket script), keyed per IP for anonymous traffic and per user for authenticated expensive actions; return 429 with `Retry-After`.
2. _How do you make sure sensitive data never ends up in logs?_ — Redact at the logger (allow-list or deny-list of keys), never log request bodies wholesale, test it by logging sensitive data on purpose.
3. _What should an API error response contain?_ — A stable machine code, a human message, a request id for support; never stack traces or internal error names.
4. _How do you trace one user action across an API and background workers?_ — Generate a correlation/request id at the edge, pass it in job payloads/headers, and include it in every log line (later: OpenTelemetry traces).
5. _What happens if your process hits an unhandled exception?_ — Log it with context and exit; a supervisor restarts it; in-flight work is retried (idempotent jobs make that safe).

## M8 — Deployment: Docker images, AWS CDK stack, Vercel

**What we built:**

- One multi-stage `Dockerfile` for three images: API, worker (`runtime` target) and a one-off migration/seed task (`migrate` target). The images use `turbo prune`, cached installs, production dependencies only, a non-root user, and the RDS CA bundle for verified TLS.
- `infra/docker/entrypoint.sh` builds `DATABASE_URL` from the RDS-managed secret (URL-encoding the password), then `exec`s the app so it receives SIGTERM directly.
- An AWS CDK stack (`infra/cdk/lib/speakup-stack.ts`) with these parts:
  - a VPC with 3 subnet tiers;
  - RDS Postgres 16: private, encrypted, `rds.force_ssl`, backups, deletion protection;
  - ElastiCache Redis: TLS, `noeviction`;
  - an S3 bucket with CORS and the abandoned-upload lifecycle rule;
  - ECS Fargate: API behind an ALB with autoscaling, worker with a 120 s stop timeout, an on-demand migration task;
  - least-privilege IAM task roles; secrets from Secrets Manager.
- Stack tests with `aws-cdk-lib/assertions` (`infra/cdk/test/stack.test.ts`): no public DB, no API keys in plain env vars, S3 access scoped to `recordings/*`, HTTPS when a certificate is set. CI also builds all three images.
- Security fix found while wiring the ALB: `trustProxy: true` let a client fake its IP by sending its own `X-Forwarded-For`. It is now `TRUST_PROXY_HOPS` (trust exactly the ALB), with a test.

**Key concepts (explain like to a junior):**

- **Infrastructure as Code (CDK)**: the whole AWS setup is TypeScript in git. `cdk synth` turns it into a CloudFormation template; `cdk deploy` makes AWS match it. That gives you reviewable diffs (`cdk diff`), reproducible environments and no "someone clicked it in the console" drift. Higher-level constructs like `ApplicationLoadBalancedFargateService` expand into ~20 resources with sane defaults.
- **Multi-stage Docker build** (`Dockerfile`): early stages have compilers, dev dependencies and sources; the final stage copies only `node_modules` (prod) and compiled `dist`. The image is smaller, has less attack surface and leaks no source. `turbo prune --docker` splits package.json files from sources, so the slow `pnpm install` layer stays cached until dependencies change.
- **Subnet tiers**: _public_ subnets hold the load balancer and the NAT gateway. _App_ subnets hold the containers: they can call out through NAT (to Clerk, Deepgram, Claude) but can't be reached from the internet. _Data_ subnets hold the databases and have no internet route at all. Security groups then say exactly who may talk to whom: the DB accepts 5432 only from the API, worker and migration task.
- **Task role vs execution role** (ECS): the _execution role_ is used by ECS itself to pull the image and read secrets before the container starts. The _task role_ is what your code gets, through the AWS SDK's default credential chain: here only S3 actions on `recordings/*`. There are no access keys in env vars, and credentials rotate automatically.
- **Secrets injection**: the task definition only _references_ a Secrets Manager ARN + JSON key. ECS resolves it at task start, so values never appear in CloudFormation, git or the console's task definition view. The flip side: changing a secret needs a task restart.
- **Rolling deploy + circuit breaker**: `minHealthyPercent: 100` starts new tasks before stopping old ones. The ALB only sends traffic to tasks that pass `/health`. If new tasks keep failing, the deployment circuit breaker rolls back to the last good version automatically.

**Why this choice / alternatives:**

- **ECS Fargate vs EKS vs App Runner/Lambda:** Fargate runs our existing containers with no servers or cluster to manage. EKS (Kubernetes) adds a lot of operational work that only pays off with a platform team. Lambda doesn't fit a long-running BullMQ worker (15-min limit, no persistent Redis connection).
- **CDK vs Terraform:** CDK is TypeScript like the rest of the repo and has high-level constructs; it is AWS-only. Terraform is multi-cloud with a huge ecosystem and an explicit state file. We'd switch for a multi-cloud setup or a team already on Terraform.
- **Migrations as a separate one-off task vs on API startup:** running `migrate deploy` on boot means N API tasks race to migrate, and a bad migration crash-loops the whole service. A separate task runs once, is visible in its own logs, and keeps the Prisma CLI out of the runtime image.
- **One NAT gateway, single-AZ RDS/Redis:** cheap for launch (~$115/mo). For HA you'd use a NAT per AZ, RDS Multi-AZ and a Redis replica with failover, at about twice the cost.

**Where it breaks at scale & what we'd do:**

- The worker is a fixed 1 task. Under load the queue grows and results get slow → autoscale on queue depth: publish BullMQ waiting-job count as a CloudWatch metric and scale the worker service on it.
- RDS `t4g.micro` has ~80 max connections; each API/worker task holds a pool → add RDS Proxy (or PgBouncer), cap pool sizes, then scale the instance or add read replicas.
- Images are built on a laptop during `cdk deploy` → build and push in CI (GitHub Actions + OIDC role, no stored AWS keys), then deploy by image tag. Maybe CDK Pipelines with a staging stage first.
- One stack holds stateful and stateless resources → split into a data stack (VPC, RDS, Redis, S3) and an app stack (ECS), so app deploys can never touch the database.

**Likely interview questions:**

1. _How do your containers get database credentials and API keys?_ — RDS generates the password into Secrets Manager. The ECS task definition references secrets, and the execution role reads them at start-up and injects them as env vars. AWS permissions come from the task role (no static keys). Nothing secret is in git, the image or the CloudFormation template.
2. _Walk me through a zero-downtime deploy on ECS._ — New task definition revision → ECS starts new tasks → they register with the ALB target group and must pass health checks → old tasks are deregistered (connection draining, 30 s) → get SIGTERM, finish in-flight work, exit. The circuit breaker rolls back if new tasks never get healthy.
3. _How do you run DB migrations safely with rolling deploys?_ — Separate step before the deploy, and backward-compatible changes only (expand/contract): add nullable columns or new tables first, deploy code that uses them, remove old columns in a later release. During the rollout, old and new code run against the same schema.
4. _Why is `X-Forwarded-For` dangerous, and how do you read the client IP behind a load balancer?_ — Clients can send the header themselves; proxies _append_ to it. Trust only the number of hops you control and take the IP that many positions from the right. Never take the leftmost value.
5. _Why put the database in an isolated subnet if it already has a security group?_ — Defense in depth: with no route to the internet, even a misconfigured security group or a public-access flag can't expose it. The SG still restricts which internal services connect.

---

## Web restyle — design tokens, third-party theming, the mascot, component tests

**What we built:**

- A design system for the whole web app: colors as CSS variables in `apps/web/app/globals.css`, exposed to Tailwind v4 through `@theme`, plus pill-button/card classes ([`docs/design-system.md`](./docs/design-system.md)).
- Manrope + Outfit through `next/font`; every screen moved from Tailwind's stock palette to tokens on a true-black background.
- Clerk, Paddle and Turnstile themed to match (Clerk via the `appearance` prop on `<ClerkProvider>`).
- An original SVG mascot with moods (`components/mascot.tsx`), animated with CSS and switched off for reduced motion.
- Component tests with React Testing Library + jsdom next to the existing Node tests.

**Key concepts (explain like to a junior):**

- **Design tokens** (`globals.css`): a token is a named design value (`--card: #141414`). Components say `bg-card`, not `#141414`, so changing the theme is a one-line change and nobody picks "almost the same grey". Tailwind v4's `@theme inline { --color-card: var(--card); }` turns each variable into utilities (`bg-card`, `text-card`, `border-card`).
- **CSS cascade layers** (`@layer base/components`): Tailwind puts utilities in a later layer than components, so `class="btn btn-primary w-full"` lets the utility win without `!important`. The catch we hit: two utilities of the _same_ kind on one element (`bg-card` + `bg-butter`) don't follow class order — whichever comes later in the generated CSS wins. Fix: never emit both (`Card` drops its default background when the caller passes one; regression test in `funnel/ui.test.tsx`).
- **`next/font`** (`app/layout.tsx`): downloads Google fonts at build time and serves them from our own domain with size-adjusted fallbacks — no request to Google from users' browsers and no layout shift when the font loads.
- **Contrast ratio (WCAG)**: text must reach 4.5:1 against its background (3:1 for large text). We measured every token pair; the muted text on pastels failed (3.4:1) and was darkened to pass (≥ 4.8:1).
- **`prefers-reduced-motion`**: an OS setting for people who get dizzy from animation. Every animation (funnel slides, mascot) is wrapped so it stops when the setting is on.
- **SVG gradients and `useId`** (`components/mascot.tsx`): SVG gradients are referenced by id (`fill="url(#id)"`), and ids are global to the page — two mascots with the same id would share one gradient. React's `useId()` gives each instance a unique, SSR-safe id.
- **jsdom component tests** (`components/mascot.test.tsx`): jsdom is a browser DOM implemented in Node, so React components render without a real browser. Testing Library queries the way users and screen readers find things (`getByRole("button", { name: "Continue" })`), which also checks accessibility.

**Why this choice / alternatives:**

- **CSS variables + Tailwind `@theme` vs a JS theme object (styled-components, Chakra):** zero runtime cost, works in Server Components, and third-party widgets (Clerk) can read the same variables. A JS theme would need a provider and client-side rendering.
- **Hand-made SVG mascot vs a Lottie/Rive animation or images:** inline SVG is tiny, themable with tokens, accessible, and needs no extra runtime. Lottie/Rive would allow richer animation if a designer produces it.
- **jsdom + Testing Library vs Playwright component testing:** jsdom tests run in milliseconds inside the existing Vitest setup; they can't check real layout or pixels. Visual checks (375 px screenshots) are done with Playwright separately.

**Where it breaks at scale & what we'd do:**

- Hand-checked screenshots don't scale → visual regression tests (Playwright screenshots compared in CI, or Chromatic).
- One theme in one CSS file is fine for one app; with a mobile app (Expo) sharing the brand → move tokens to a shared package (e.g. Style Dictionary) that outputs CSS variables and React Native values.
- Copy and layout are tuned for English → externalize strings and test long translations before adding languages.

**Likely interview questions:**

1. _How would you implement theming / dark mode in a Tailwind app?_ — Define colors as CSS variables, map them in `@theme`, and swap the variable values per theme (`:root[data-theme="dark"]` or `prefers-color-scheme`). Components never change.
2. _How do you make sure a UI is accessible?_ — Semantic elements and roles, measured contrast (4.5:1), visible focus, reduced-motion support, labels for meaningful images (decorative ones `aria-hidden`), and tests that query by role so a missing label fails the test.
3. _What's the difference between unit tests in Node and component tests in jsdom?_ — Node tests run pure logic; jsdom adds a fake DOM so components render and respond to events. jsdom has no layout engine, so sizes and positions need a real browser (Playwright).
4. _Why can two Tailwind classes like `bg-red-500 bg-blue-500` behave unexpectedly?_ — The winner is decided by order in the generated stylesheet, not in the `class` attribute. Avoid conflicting utilities (or use a merge helper like `tailwind-merge`).
5. _How did you style a third-party auth widget (Clerk) to match?_ — Its `appearance` API: variables for colors/fonts/radius (pointing at our CSS variables) and per-element overrides. Where the library's own selector was more specific (low-alpha borders on black), we overrode only the unfocused state so its focus ring still shows.
