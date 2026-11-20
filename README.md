# SpeakUp

Speaking & communication skills trainer: users record themselves speaking and get AI feedback on
pace, pauses, filler words, clarity and (for read-aloud tasks) accuracy.

The full build spec is in [`SPEC.md`](./SPEC.md). Interview-prep notes per milestone are in
[`LEARNING_NOTES.md`](./LEARNING_NOTES.md).

## Repo layout

```
apps/
  web/      Next.js (App Router) + Tailwind — the UI           → http://localhost:3000
  api/      Fastify REST API                                    → http://localhost:4000
  worker/   BullMQ worker that runs audio analysis jobs
packages/
  db/       Prisma schema, migrations, seed, typed DB client
  shared/   Zod schemas + types shared by web/api/worker
infra/
  docker-compose.yml   Postgres 16 (host port 5433) + Redis 7 + LocalStack S3 (port 4566) for local dev
  localstack/          creates the local recordings bucket (private, encrypted, CORS for the web app)
  docker/entrypoint.sh container entrypoint (builds DATABASE_URL from the RDS secret)
  cdk/                 AWS CDK app (TypeScript): the production infrastructure
Dockerfile             production images for api, worker and the migration task
```

## Prerequisites

- Node.js 22.12+ (see `.nvmrc`)
- pnpm 10 (`npm install -g pnpm@10` or `corepack enable`)
- Docker Desktop (for Postgres, Redis and the local S3)

## Getting started

```bash
pnpm install
cp .env.example .env          # one .env at the repo root, used by every app
pnpm infra:up                 # start Postgres + Redis + local S3 in Docker
pnpm db:migrate               # apply migrations (creates tables)
pnpm db:seed                  # load the course, lessons and baseline exercise
pnpm dev                      # web + api + worker (+ shared in watch mode)
```

Check it works:

- http://localhost:3000 — web placeholder page
- http://localhost:4000/health — `{"status":"ok"}` (liveness)
- http://localhost:4000/health/ready — pings Postgres + Redis (readiness)
- the worker logs `worker ready`

Stop the databases with `pnpm infra:down` (data is kept in Docker volumes; local S3 recordings
are not persisted).

### Recordings storage (S3)

In dev, recordings go to **LocalStack** (an S3 emulator in Docker) — no AWS account needed.
`.env.example` already points at it (`S3_ENDPOINT=http://localhost:4566`, bucket
`speakup-recordings-dev`, credentials `test`/`test`). The browser uploads straight to S3 with a
pre-signed POST, so audio never passes through the API.

To use a **real AWS bucket** instead (region `us-east-1`, next to the database):

1. Create a private bucket: block all public access on, default encryption (SSE-S3) on.
2. CORS: allow `POST`, `GET`, `HEAD` from your web origin(s), expose `ETag`.
3. Lifecycle rule `expire-abandoned-uploads`: prefix `recordings/` + tag
   `upload-status=pending` → expire after 1 day. Every upload is signed with that tag; submitting
   the attempt removes it, so only recordings that were uploaded but never submitted are deleted.
4. A dev IAM user (no console access) whose policy allows `s3:PutObject`, `GetObject`,
   `DeleteObject`, `PutObjectTagging`, `GetObjectTagging`, `DeleteObjectTagging` on
   `arn:aws:s3:::<bucket>/recordings/*`, plus `s3:ListBucket` limited to prefix `recordings/*`
   (so a missing file is a 404, not a 403). In prod the ECS task role gets the same permissions.
5. In `.env`: `S3_BUCKET`, `AWS_REGION`, the access key pair, and **empty** `S3_ENDPOINT`.

### Analysis (speech-to-text + AI feedback)

The worker needs two API keys in `.env` (it exits at startup with a clear error without them):

- `DEEPGRAM_API_KEY` — [Deepgram console](https://console.deepgram.com) → API keys.
- `ANTHROPIC_API_KEY` — [Claude Console](https://platform.claude.com) → API keys.
  `ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`.

Deepgram downloads each recording through a 10-minute pre-signed S3 link, so this needs the
real S3 bucket (it can't reach LocalStack on your machine).

The worker also needs **ffmpeg** to analyze the voice (pitch, loudness, real pauses). Install it
locally (`winget install Gyan.FFmpeg`, `brew install ffmpeg`, `apt install ffmpeg`) or point
`FFMPEG_PATH` at the binary. Without it, analyses still complete with transcript-only metrics
(a warning is logged per job). The Docker image ships it.

Flow: record → `/results/<attemptId>` polls every 1.5 s → worker runs Deepgram → decodes the
audio (ffmpeg) → metrics + scores → Claude → the report appears.

### Web funnel (`/start`)

The landing page links to `/start`: questions → mini-lesson → an **anonymous** 45-second speaking
check → sign-up → results → plan → paywall (SPEC §15). How it works is documented in
[`docs/funnel-reference.md`](./docs/funnel-reference.md).

- **Bot check:** Cloudflare Turnstile. With the two `*TURNSTILE*` variables empty, dev uses
  Cloudflare's always-pass test keys. For real keys: Cloudflare dashboard → Turnstile → Add widget
  (hostname `localhost` for dev, your domain in prod).
- **Limits:** one baseline per funnel session, `FUNNEL_IP_DAILY_LIMIT` anonymous analyses per IP
  per day (Redis).
- **Cleanup:** the worker deletes unclaimed funnel sessions, their attempts and audio after 7 days
  (daily at 03:00 UTC).
- To restart the funnel in a browser: DevTools → Application → Local Storage → delete
  `speakup-funnel`.

### Payments (Paddle sandbox)

Paddle is the merchant of record (it handles sales tax/VAT). The browser opens Paddle's overlay
checkout; **Paddle's webhook** — not the browser — makes an account Pro.

1. Create a sandbox account at https://sandbox-vendors.paddle.com.
2. **Catalog → Products**: create "SpeakUp Pro" with a monthly recurring price → copy the price id
   into `PADDLE_PRICE_ID_PRO_MONTHLY`.
3. **Developer tools → Authentication**: create an API key → `PADDLE_API_KEY`; create a
   client-side token → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
4. **Checkout → Checkout settings**: set the default payment link to `http://localhost:3000`.
5. Webhooks need a public URL. Run a tunnel to the API, e.g.
   `cloudflared tunnel --url http://localhost:4000` (no account needed) or `ngrok http 4000`.
6. **Developer tools → Notifications → New destination**: URL
   `https://<your-tunnel>/v1/webhooks/paddle`, events `subscription.*` (created, activated,
   updated, canceled, past_due, paused, resumed, trialing) → copy its secret key into
   `PADDLE_WEBHOOK_SECRET`.
7. Restart `pnpm dev`, open `/pricing`, pay with a Paddle test card (e.g. `4242 4242 4242 4242`,
   any future date, any CVC). The page waits until the webhook arrives and shows Pro.

Replays: Paddle → Notifications → the event → **Replay**. The API answers 200 and changes
nothing (`WebhookEvent(source, eventId)` is unique). The tunnel URL changes every time you
restart `cloudflared` — update the destination URL when it does.

> **Port 5433:** Docker Postgres is published on host port 5433 so it doesn't clash with a
> locally installed Postgres on 5432. To use a hosted Postgres (e.g. Neon) instead, point
> `DATABASE_URL` at it and run `pnpm db:migrate:deploy && pnpm db:seed`.

## Scripts (run from the repo root)

| Script                   | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| `pnpm dev`               | Run all apps in watch mode via Turborepo              |
| `pnpm build`             | Build every package                                   |
| `pnpm lint`              | ESLint in every package                               |
| `pnpm typecheck`         | `tsc --noEmit` in every package                       |
| `pnpm test`              | Vitest in every package                               |
| `pnpm format`            | Prettier write (`format:check` is used in CI)         |
| `pnpm infra:up/down`     | Start/stop local Postgres + Redis + S3                |
| `pnpm db:migrate`        | Create/apply migrations in dev (`prisma migrate dev`) |
| `pnpm db:migrate:deploy` | Apply existing migrations only (CI/prod)              |
| `pnpm db:seed`           | Seed content (idempotent — safe to re-run)            |
| `pnpm db:reset`          | Drop DB, re-apply migrations, re-seed (dev only!)     |
| `pnpm db:studio`         | Browse data in Prisma Studio                          |
| `pnpm cdk:synth`         | Generate the CloudFormation template (no AWS needed)  |
| `pnpm cdk:diff/deploy`   | Compare with / deploy to your AWS account             |

CI (`.github/workflows/ci.yml`) runs install → format check → lint → typecheck → test on every
push to `main` and every pull request.

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Each app validates its own
variables with Zod at startup and exits with a readable error if something is missing.
Only `NEXT_PUBLIC_*` variables are exposed to the browser.

| Variable                                                                              | Where              | Purpose                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`                                        | web, Vercel (Prod) | Domain split: origin of the marketing site and of the product app. Set both or neither. With both set, `proxy.ts` redirects each page to its host (see `docs/architecture.md`, "Two hosts"). Empty in dev and previews.     |
| `LOAD_TEST_AUTH_SECRET`, `LOAD_TEST_STACK`                                            | api                | Load testing only. Lets k6 sign in as `loadtest_*` users with HMAC tokens instead of Clerk. Refused in production unless `LOAD_TEST_STACK=true`. See [`docs/load-testing.md`](./docs/load-testing.md).                      |
| `ANALYSIS_PROVIDERS`, `FAKE_STT_MEDIAN_MS`, `FAKE_LLM_MEDIAN_MS`, `FAKE_FAILURE_RATE` | worker             | Load testing only. `fake` replaces Deepgram and Claude with simulated providers (realistic delays, optional failure rate, no network calls, no keys). See [`docs/load-testing.md`](./docs/load-testing.md). Default `real`. |

## Deploy (AWS + Vercel)

```
            Vercel (web, Next.js)
                    │ HTTPS
Internet ──► ALB (public subnets) ──► API tasks (ECS Fargate) ─┐
                                      Worker tasks (Fargate) ──┼─► RDS Postgres 16
                                                               ├─► ElastiCache Redis 7 (TLS)
                                                               └─► S3 recordings (VPC endpoint)
```

Everything on AWS is defined in [`infra/cdk`](./infra/cdk) (one stack, region `us-east-1`):

- **Network:** a VPC with public, app and data subnets and one NAT gateway.
- **Postgres (RDS):** private, encrypted, TLS-only, 7-day backups, deletion protection.
- **Redis (ElastiCache):** TLS, with `noeviction` set for BullMQ.
- **Recordings bucket (S3):** private, with CORS and the abandoned-upload cleanup.
- **ECS cluster:** the API behind a load balancer (1–4 tasks, CPU autoscaling), the worker
  (1 task), and a migration task you run on demand.
- **Permissions:** IAM task roles that can only touch `recordings/*`. API keys live in Secrets
  Manager and reach the containers as environment variables when the tasks start.

**Cost:** roughly **$110–120/month** at these smallest sizes before traffic (NAT gateway ~$33,
two Fargate tasks ~$36, load balancer ~$17, RDS ~$16, ElastiCache ~$12, the rest small).
`cdk synth` is free; `cdk deploy` starts billing. Set an AWS budget alert first
(Billing → Budgets).

### Prerequisites

- An AWS account and the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html),
  signed in (`aws configure` or `aws configure sso`) with admin rights, region `us-east-1`.
- Docker running: `cdk deploy` builds the three images from [`Dockerfile`](./Dockerfile) on
  your machine and pushes them to ECR.
- A domain you control. Clerk's production instance, HTTPS for the API and Turnstile all need it.
  Below, `speakup.app` = the web app and `api.speakup.app` = the API (use your own).

### 1. Production keys

- **Clerk:** create a production instance for your domain → `pk_live_…` / `sk_live_…`, and add
  the DNS records Clerk asks for.
- **Paddle:** live account (or keep sandbox at first: `speakup:paddleEnv` stays `sandbox`).
  The webhook destination is `https://api.speakup.app/v1/webhooks/paddle`.
- **Turnstile:** a widget for `speakup.app`.
- **Deepgram** and **Anthropic:** production API keys with spend limits.

### 2. Store the API's secrets (once)

Copy [`infra/cdk/app-secrets.example.json`](./infra/cdk/app-secrets.example.json) to a file
**outside the repo**, fill in every value (`IP_HASH_SECRET`: `openssl rand -hex 32`), then:

```bash
aws secretsmanager create-secret --region us-east-1 --name speakup/app \
  --secret-string file://speakup-app-secrets.json
rm speakup-app-secrets.json
```

To change a value later, run `aws secretsmanager put-secret-value` with the same `--secret-id`,
then restart the services (ECS console → service → Update → Force new deployment). Tasks only
read secrets when they start. The database password is generated by RDS (secret `speakup/db`);
you never handle it.

### 3. HTTPS certificate + config

1. ACM console (us-east-1) → Request certificate → `api.speakup.app` → DNS validation → add the
   CNAME it shows at your DNS provider → wait for **Issued**.
2. In [`infra/cdk/cdk.json`](./infra/cdk/cdk.json) → `context`, set:
   - `speakup:webOrigins`: your web origins, comma-separated (`https://speakup.app,https://www.speakup.app`).
     These are used for API CORS, the bucket's CORS and Clerk's authorized parties.
   - `speakup:certificateArn`: the certificate's ARN. Without it the API is HTTP-only, and
     browsers block an HTTPS site from calling it. Synth warns about this.
   - `speakup:paddleEnv`: `sandbox` or `production`.

### 4. Deploy

```bash
pnpm install
pnpm --filter @speakup/infra exec cdk bootstrap   # once per account/region
pnpm cdk:synth                                    # check the template builds
pnpm cdk:diff                                     # see what will change
pnpm cdk:deploy                                   # first run ~20–30 min (RDS + Redis)
```

The deploy prints these outputs:

- `ApiLoadBalancerUrl`: at your DNS provider, add a CNAME `api.speakup.app` → that hostname.
  Check it with `curl https://api.speakup.app/health`, which should return `{"status":"ok"}`.
- `MigrateCommand`: run it now to create the tables. Use Git Bash on Windows; the quoting is
  for a POSIX shell.
- `RecordingsBucket`: the bucket's name, for reference.

Seed the course content by running `MigrateCommand` again with this appended:

```bash
--overrides '{"containerOverrides":[{"name":"migrate","command":["pnpm","exec","prisma","db","seed"]}]}'
```

The migrate task logs go to CloudWatch (log group `SpeakUp-MigrateLogs…`). Seeding is idempotent.

### 5. Web on Vercel

1. Vercel → Add New Project → import the repo → **Root Directory** `apps/web` (framework: Next.js).
2. **Build Command**: `cd ../.. && pnpm turbo run build --filter=@speakup/web`. The web app
   imports `@speakup/shared`, which has to be compiled first. Leave Install Command on the default
   (Vercel runs `pnpm install` for the workspace).
3. Environment variables (Production): `NEXT_PUBLIC_API_URL=https://api.speakup.app`,
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, the four `NEXT_PUBLIC_CLERK_*_URL`
   values from `.env.example`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`,
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL`, and for the domain
   split `NEXT_PUBLIC_SITE_URL=https://speakup.app` + `NEXT_PUBLIC_APP_URL=https://app.speakup.app`.
4. Domains → add both `speakup.app` and `app.speakup.app` to the same project (both must be in
   `speakup:webOrigins`). In Paddle, set the default payment link to `https://app.speakup.app/pricing`,
   and allow `app.speakup.app` in the Turnstile widget's hostnames.

### Updating

- **Code:** `pnpm cdk:deploy` rebuilds the changed images and rolls them out with no downtime.
  New tasks start before old ones stop, and a deploy that fails health checks rolls back.
- **Schema changes:** run `MigrateCommand` **before** deploying code that needs the change, and
  keep migrations backwards-compatible (add a column first, drop the old one in a later release).
  During a rollout, old and new tasks run side by side.
- **Logs:** CloudWatch → Log groups `SpeakUp-ApiLogs…` / `SpeakUp-WorkerLogs…` (JSON, 30 days).

### Tearing down

`pnpm --filter @speakup/infra exec cdk destroy` removes everything except the user data. RDS has
deletion protection (turn it off in the console first; a final snapshot is kept) and the
recordings bucket is retained. Delete both by hand if you really mean it. The `speakup/app`
secret is yours, so delete it with the CLI.

## Cost guardrails (to set up before launch)

Set a monthly spend limit for the Anthropic API in the Anthropic console, and a usage alert in
Deepgram. The app also enforces per-user quotas and max audio length (see SPEC §9).
