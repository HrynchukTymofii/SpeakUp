# Runbook

How to operate SpeakUp in production: deploy, roll back, read logs, rotate secrets, and fix the
usual problems. First-time setup (accounts, certificates, the first `cdk deploy`) is in the
README's [Deploy section](../README.md#deploy-aws--vercel); this document starts after that.

## Where things run

| Part                  | Where                                       | Address / name                                     |
| --------------------- | ------------------------------------------- | -------------------------------------------------- |
| Web: marketing site   | Vercel (one project for both hosts)         | https://speakup.fibipals.com (production = `main`) |
| Web: product app      | Vercel (same project)                       | https://app.speakup.fibipals.com                   |
| API (Fastify)         | AWS ECS Fargate behind a load balancer      | https://speakup-api.fibipals.com                   |
| Worker (BullMQ)       | AWS ECS Fargate, no load balancer           | —                                                  |
| Postgres 16           | AWS RDS, private subnets                    | secret `speakup/db` (managed by RDS)               |
| Redis 7               | AWS ElastiCache, TLS                        | —                                                  |
| Recordings            | S3 bucket (private)                         | stack output `RecordingsBucket`                    |
| Public media (videos) | S3 bucket, `media/*` public                 | stack outputs `MediaBucket`, `MediaBaseUrl`        |
| Infrastructure        | one CDK stack `SpeakUp`, region `us-east-1` | [`infra/cdk`](../infra/cdk)                        |
| App API keys          | Secrets Manager                             | secret `speakup/app`                               |

Settings that are not secrets (web origins, certificate, Paddle environment, Claude model) live
in [`infra/cdk/cdk.json`](../infra/cdk/cdk.json) → `context`. Limits (daily analyses, rate limits)
use the defaults in `apps/api/src/env.ts` unless set in the task definition.

## Is it up?

```bash
curl https://speakup-api.fibipals.com/health        # {"status":"ok"}  — the process is alive
curl https://speakup-api.fibipals.com/health/ready  # {"status":"ok","checks":{"db":"ok","redis":"ok"}}
```

`/health` never touches dependencies (the load balancer uses it, so a database outage doesn't make
ECS kill healthy containers). `/health/ready` answers **503 `degraded`** and names the failing
dependency when Postgres or Redis is unreachable.

## Deploying

### Web (Vercel)

- **Production:** merging a PR into `main` deploys automatically.
- **Previews:** every PR gets a preview URL. Preview builds need the environment variables set for
  the _Preview_ environment in Vercel (Settings → Environment Variables); a variable scoped to
  Production only makes the preview build fail (`NEXT_PUBLIC_API_URL … received undefined`).
  Sign-in and API calls don't work on preview URLs with production Clerk keys and the API's CORS
  allowlist — previews are for visual review.

### API and worker (AWS)

From an up-to-date `main`, with Docker running and AWS credentials for the account:

```bash
pnpm cdk:diff     # read it: what will change?
pnpm cdk:deploy   # builds the images, pushes them, rolls out new tasks
```

- Rollouts have **no downtime**: new tasks start before old ones stop (`minHealthyPercent: 100`).
- A rollout whose tasks fail health checks **rolls back automatically** (ECS deployment circuit
  breaker). The deploy command then fails; read the service's _Events_ tab in the ECS console.
- The worker gets 120 s to finish in-flight jobs when it is stopped.

### Database migrations

Migrations are not applied by the deploy. Run them as a one-off task with the `MigrateCommand`
stack output (Git Bash on Windows). Order for a schema change:

1. **Expand:** a migration that only adds (new nullable column / table). Run `MigrateCommand`.
2. Deploy the code that uses it (`pnpm cdk:deploy`).
3. **Contract** in a later release: drop what is no longer used.

During a rollout old and new tasks run side by side, so a migration must never break the version
that is currently running. Migration logs: CloudWatch log group `SpeakUp-MigrateLogs…`.

## Rolling back

| What                 | How                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                  | Vercel → Deployments → pick the last good one → **Instant Rollback** (or **Promote**).                                                                                                                                                        |
| API / worker         | Automatic if health checks fail. Otherwise: `git revert` the bad commit on `main`, then `pnpm cdk:deploy`. For a faster manual fix: ECS console → service → Update → choose the previous **task definition revision** → Force new deployment. |
| Database data        | RDS keeps 7 days of automated backups: RDS console → the instance → **Restore to point in time** (creates a new instance; point the stack at it or copy data back). Deletion protection is on.                                                |
| Configuration secret | Secrets Manager keeps the previous value of `speakup/app` (label `AWSPREVIOUS`); put it back with `put-secret-value`, then force a new deployment.                                                                                            |

## Logs

CloudWatch → Log groups, kept **30 days**, JSON lines:

- `SpeakUp-ApiLogs…` — one line per request plus app events (`attempt created`, `funnel claimed`…).
- `SpeakUp-WorkerLogs…` — job events (`transcribed`, `analysis completed`, `analysis failed`).
- `SpeakUp-MigrateLogs…` — migration and seed runs.

Every API request has a `reqId`; the API passes it to the worker with the job, so one recording can
be followed end to end. In CloudWatch Logs Insights:

```
fields @timestamp, msg, attemptId, code, err
| filter attemptId = "<attempt id>" or requestId = "<request id>" or reqId = "<request id>"
| sort @timestamp asc
```

The error body users see contains the `requestId` too, so a support report can be traced.

Logs never contain tokens, emails, transcripts or audio URLs: the redaction list is shared in
`packages/shared/src/logging.ts` and applied by both services.

## Rotating a secret

1. Create the new key at the provider (Clerk, Paddle, Turnstile, Deepgram, Anthropic).
2. Update the secret, keeping the other fields:

   ```bash
   aws secretsmanager get-secret-value --region us-east-1 --secret-id speakup/app \
     --query SecretString --output text > /tmp/app.json   # edit the one field
   aws secretsmanager put-secret-value --region us-east-1 --secret-id speakup/app \
     --secret-string file:///tmp/app.json && rm /tmp/app.json
   ```

3. Tasks read secrets only at start: ECS console → **both** services (Api, Worker) → Update →
   Force new deployment.
4. Revoke the old key at the provider once the new tasks are healthy.

Notes: rotating `IP_HASH_SECRET` resets the per-IP funnel limits (hashes change). The database
password (`speakup/db`) is generated by RDS and never handled by hand. Web keys
(`NEXT_PUBLIC_*`, `CLERK_SECRET_KEY` for the web) are changed in Vercel and need a redeploy there.

## Alarms

Defined in `infra/cdk/lib/monitoring.ts`. Each one emails `speakup:alarmEmail` (via the SNS topic
`SpeakUp alarms`) when it fires and again when it recovers. The `SpeakUp` CloudWatch dashboard
(the `DashboardUrl` output) shows every alarm's state above the graphs it watches. The load-test
stack has the same alarms but never emails.

| Alarm (`SpeakUp-…`)   | Fires when                                                    | First checks                                                                                                                           |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `api-5xx`             | the API answered ≥ 10 requests with a 5xx in 5 min            | API logs at `level >= 50`; `/health/ready` for a DB or Redis outage; a recent deploy (roll back).                                      |
| `alb-5xx`             | the load balancer itself returned ≥ 10 5xx in 5 min           | No healthy task (see below) or tasks timing out. ECS → Api service → events.                                                           |
| `api-no-healthy-task` | no API task passed `/health` for 3 min                        | ECS → Api service → stopped tasks' reason; API logs at boot (bad env var). A deploy circuit breaker should roll back by itself.        |
| `api-errors`          | the API logged ≥ 5 errors in 5 min                            | Logs Insights on the API group: `filter level >= 50`.                                                                                  |
| `queue-backlog`       | ≥ 100 recordings waited for 10 min, **or** no worker reported | ECS → Worker: running count, and is it at `workerMaxTasks`? Worker logs. Missing data = no worker alive (task crash loop, Redis down). |
| `worker-errors`       | the worker logged ≥ 5 errors in 5 min                         | Worker logs `filter level >= 50`: `STT_FAILED` → Deepgram, `LLM_*` → Anthropic (see Common problems).                                  |
| `db-cpu`              | Postgres CPU ≥ 80% for 15 min                                 | RDS Performance Insights / slow queries; scale `speakup:dbInstanceSize` ([`scaling.md`](./scaling.md)).                                |
| `db-connections`      | connections ≥ 80% of the instance's approx. limit             | Sum of pools: 4 API × 8 + workers × 3. Lower `workerMaxTasks`, move up a DB size, or add RDS Proxy ([`scaling.md` §3](./scaling.md)).  |
| `db-free-storage`     | under 2 GB free                                               | Storage autoscales up to 100 GB; if it hit the cap, raise `maxAllocatedStorage`.                                                       |
| `redis-memory`        | Redis memory ≥ 80%                                            | `maxmemory-policy` is `noeviction`: at 100% new jobs **fail**. Look for a stuck backlog or keys without expiry; move up a node size.   |
| `redis-cpu`           | Redis engine CPU ≥ 80% for 15 min                             | Polling or rate-limit traffic spike; a bigger node.                                                                                    |

Error counts come from log metric filters (`{ $.level >= 50 }`, pino's error and fatal levels)
into the metrics `ApiErrors` and `WorkerErrors` in the `SpeakUp/SpeakUp` namespace.

Not covered yet: errors in the web app (Vercel) and stack traces grouped by cause; that needs an
error tracker such as Sentry.

## Scheduled work

| What                                                | When                               | Where                                                      |
| --------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Delete unclaimed funnel sessions + their recordings | daily 03:00 UTC, older than 7 days | worker, `maintenance` queue (`apps/worker/src/cleanup.ts`) |
| Delete uploads that were never submitted            | 1 day after upload                 | S3 lifecycle rule `expire-abandoned-uploads`               |
| Abort incomplete multipart uploads                  | after 1 day                        | S3 lifecycle rule                                          |

The cleanup schedule lives in Redis (a BullMQ job scheduler), so it runs once a day however many
worker tasks run.

## Common problems

| Symptom                                                | Likely cause                                                                  | Check / fix                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results stay on "Analyzing…"                           | worker down, or Redis unreachable                                             | ECS → Worker service running? `/health/ready` → `redis`? Worker logs for `job failed`. Jobs retry 3× with exponential backoff (from 5 s); after the last try the attempt is marked `failed`.                                                                                                        |
| Many attempts `failed` with `STT_FAILED`               | Deepgram key, quota or outage                                                 | Worker logs (`Deepgram <status>`). 429/5xx are retried; 4xx (bad key) are not. Rotate the key if needed.                                                                                                                                                                                            |
| `LLM_FAILED` / `LLM_INVALID_OUTPUT`                    | Anthropic key, spend limit, model name, or output that fails validation twice | Worker logs; check `speakup:anthropicModel` in `cdk.json` is a valid model id.                                                                                                                                                                                                                      |
| `NO_SPEECH`                                            | fewer than 5 words recognized (silent or wrong microphone)                    | User-side; counts against the daily quota on purpose.                                                                                                                                                                                                                                               |
| User paid but is still Free                            | webhook not delivered or not linked                                           | Paddle → Notifications → delivery log for `/v1/webhooks/paddle`. API logs: `Invalid signature` (wrong `PADDLE_WEBHOOK_SECRET`), `subscription event without customData.userId` (subscription not made through our checkout), `unknown user`. Re-sending the event from Paddle is safe (idempotent). |
| Web shows CORS errors calling the API                  | web origin not allowed                                                        | `speakup:webOrigins` in `cdk.json` must contain the exact origin; redeploy the stack.                                                                                                                                                                                                               |
| Page bounces between hosts / `/start` 404s on one host | domain split misconfigured                                                    | `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` (Vercel, Production) must be the two domains attached to the project, origins only; redeploy after changing them. Removing both turns the split off.                                                                                               |
| Funnel says "Bot check failed"                         | Turnstile keys or domain                                                      | The Turnstile widget must allow the web domain; site key (Vercel) and secret (`speakup/app`) must be a pair.                                                                                                                                                                                        |
| "Too many speaking checks from this network today"     | per-IP funnel limit (3 per day by default)                                    | Expected for abuse; raise `FUNNEL_IP_DAILY_LIMIT` in the API task definition if offices/NAT share IPs.                                                                                                                                                                                              |
| Vercel build fails with a `ZodError` on an env var     | the variable is missing for that environment                                  | Add it in Vercel for Production and/or Preview, redeploy.                                                                                                                                                                                                                                           |
| API tasks keep restarting                              | bad config: the API exits at boot when an env var is invalid                  | API logs right after start show the validation message.                                                                                                                                                                                                                                             |

## Costs

Roughly $125–135/month for AWS at the current sizes before traffic (breakdown in the README's
[Deploy section](../README.md#deploy-aws--vercel)), plus Deepgram and Anthropic usage. Each analysis stores its estimated cost (`Analysis.costUsdMicros`), so spend per user/day can
be queried. Guardrails to set before launch: README → [Cost guardrails](../README.md#cost-guardrails-to-set-up-before-launch).
