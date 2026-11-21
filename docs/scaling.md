# Scaling: where SpeakUp breaks and what we do about it

How much load the system takes, which part gives out first, what we've changed and what's still
open. The numbers come from the load tests in [`load-testing.md`](./load-testing.md); the
architecture they refer to is in [`architecture.md`](./architecture.md).

> **Short version.** Browsing is cheap: one 0.5-vCPU API task serves hundreds of requests per
> second at single-digit-millisecond latency. **Practicing is the limit**, because every
> recording is a job that waits ~3 s on Deepgram and Claude. One worker task finishes ~55–60
> recordings per minute whatever its CPU, so capacity comes from the number of workers.
> Production scales from 1 to 25 workers on queue depth, which held **1,000 people practicing at
> once** in the load test. The main open problem is a sudden spike: new workers take minutes to
> start.

## Status

As of 2026-11-21. Each row is one bottleneck from §2.

| Bottleneck                         | Today                                                                                                    | Open                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 2.1 Worker throughput              | Workers autoscale on queue depth, 1 → 25 tasks, 4 jobs per task                                          | Cold start, admission control, priorities, circuit breaker |
| 2.2 Waiting turns into DB load     | Web long-polls (Redis pub/sub); pending reads skip big JSON; the request user is cached 60 s per process | Push notifications on mobile                               |
| 2.3 DB connections                 | Pools capped (API 8, worker 3) on a `db.t4g.small`: 107 of ~190 connections at full scale                | RDS Proxy, read replica                                    |
| 2.4 Quota race                     | Fixed: a per-user Redis lock around check + insert                                                       | —                                                          |
| 2.5 Queries that grow with history | —                                                                                                        | Per-user stats row, topic selection in SQL                 |
| 2.6 Single points of failure       | —                                                                                                        | Redis replica with failover, RDS Multi-AZ, NAT per AZ      |

**Measured capacity:** 1,000 people practicing at once with ~25 workers running: 9,095 recordings
in ~8 min, 0 timeouts, 0 failures, result in 4.2 s (p50) / 8.4 s (p95), RDS at 21% CPU
([`load-testing.md` run 7](./load-testing.md#run-7-practice-1000-users-k6-inside-aws-long-polling-2026-11-20)).
Production runs that setup (`speakup:workerMaxTasks=25`, `speakup:dbInstanceSize=small` in
`infra/cdk/cdk.json`). New stacks without those settings get 10 workers on a micro instance, about
450 people at once. Deepgram and Claude were simulated in these tests, so their real rate limits at
this scale are still unmeasured.

## 1. How the load flows

```
Browser ──1. create──► API ──► Postgres          (attempt row, quota check)
   │                    │
   └──2. upload───────► S3                       (pre-signed POST; audio never touches the API)
   │
   └──3. submit──────► API ──► Redis (BullMQ) ──► Worker ×1–25, 4 jobs at a time each
   │                                                ├─ STT (Deepgram)     ~1 s   ┐ waiting
   │                                                ├─ ffmpeg, scoring, DB ~1 s  │ (I/O)
   │                                                ├─ LLM (Claude)       ~2 s   ┘
   │                                                └─ Postgres writes, publish "changed"
   └──4. GET ?wait=20 (held until "changed") ────► API ◄── Redis pub/sub
```

Audio goes from the device straight to S3; the API only signs the upload and checks it afterwards.
So uploads aren't where the limits are.

## 2. The bottlenecks, in the order they hit

Each is a design problem: it doesn't go away with a bigger instance or a higher provider tier.

### 2.1 Worker throughput is fixed, and most of it is waiting

**Problem.** A worker task runs 4 jobs at a time and each takes ~4.1 s, ~3 s of it waiting on the
two providers. That caps one task at ~1 job/s (~55–60 recordings/min). A bigger CPU doesn't help:
the slots are full of waiting, not computing.

**Evidence** (one worker, step load; full table in
[`load-testing.md` §5](./load-testing.md#5-results)):

| Users practicing | Finished / min | Wait for feedback p50 / p95 | No result in 60 s |
| ---------------- | -------------- | --------------------------- | ----------------- |
| 12               | ~12            | 4.5 s / 6 s                 | 0%                |
| 30               | ~40            | 6 s / 7.5 s                 | 0%                |
| 60               | ~46            | 7.5 s / 15 s                | 0%                |
| 120              | ~55 (ceiling)  | 35–56 s / 50–60 s           | **23%**           |

**What we do.** Scale the worker service on **queue depth**, not CPU (CPU stays low while users
wait). Workers publish the number of waiting jobs to CloudWatch every 30 s; ECS step scaling adds
1, 3 or 6 tasks when more than 8, 30 or 100 jobs wait, and removes one at a time when the queue is
empty. Stopping tasks finish their jobs first (120 s). Concurrency stays at 4 per task, because CPU
reached ~66% of 0.5 vCPU at 4 (ffmpeg and scoring do use some).

**Still open.**

- **Cold start.** A Fargate task needs ~1 min to start, so a jump from 0 to 1,000 users in one
  minute took ~10 min to scale out, and most recordings in that window timed out. Fixes, cheapest
  first: bigger steps sized from the backlog (waiting ÷ ~15 per worker), a shorter alarm period, a
  higher minimum at known peak times (scheduled scaling), admission control, a client wait longer
  than 60 s.
- **Admission control:** past a queue limit, `POST /attempts` answers "busy, try in a minute"
  instead of accepting work that will time out. Pro users get a higher priority (BullMQ priorities).
- **Provider limits:** with enough workers, Deepgram and Anthropic rate limits cap throughput. A
  circuit breaker would stop calling a failing provider for a while instead of piling up retries.

### 2.2 Waiting turns a slow worker into database load

**Problem.** While a recording is analyzed, its page waits for the result. With plain polling,
waiting longer means more requests, more DB load, slower worker writes, and longer waits again.

**Evidence.** With polling every 1.5 s, **83% of all API requests were "is it done yet?"**
(6,474 of 7,806). Between minute 5 and 6 the worker finished the same ~55 recordings/min, but API
traffic tripled (17 → 51 req/s) and Postgres transactions tripled (93 → 269/s). Each API request
also cost ~3.6 transactions, because the auth hook looked the user up on every request.

**What we do.**

- **Long-polling.** The page asks `GET /attempts/:id?wait=20`; the API holds the request until the
  worker publishes the attempt id on Redis (`attempt-events`) or 20 s pass. A 10 s wait is 1–2
  requests instead of ~7, and the result shows up the moment it's saved. A held request uses no DB
  connection, only an idle socket. (Why long-polling and not SSE: `SPEC.md` §14.)
- Pending reads skip the transcript and feedback JSON.
- The request user (id and plan) is cached in each API process for 60 s.
- If the API answers at once anyway, the page backs off (1.5 s → 3 s → 5 s).

**Still open.** Push notifications (APNs / FCM) for the mobile app, which also let the user leave
the screen.

### 2.3 More tasks multiply database connections

**Problem.** Every API or worker process keeps its own connection pool. Postgres has a fixed
connection limit (~80 on `db.t4g.micro`, ~190 on `small`), so adding tasks is what runs out first,
and a bigger instance raises the cap only a little.

**What we do.** Pools are sized per service (`DB_POOL_MAX`: API 8, worker 3) so that all tasks at
maximum scale fit: 4 × 8 + 25 × 3 = 107 on the small instance. A stack test checks this budget.

**Still open.** RDS Proxy (or PgBouncer) so many client connections share a few dozen real ones;
then a read replica for history and progress reads. Needed past ~30 workers.

### 2.4 The daily quota was check-then-insert

**Problem.** `POST /attempts` counts today's attempts and then inserts one. Parallel requests all
saw "under the limit": the load test got 120 recordings accepted where the quota allowed 60. Each
one over the limit is an analysis nobody paid for.

**What we do.** A per-user Redis lock (`apps/api/src/services/user-lock.ts`) makes the count and
the insert one step for that user; other users aren't blocked. The quota-race scenario in
[`load-testing.md`](./load-testing.md) checks it.

### 2.5 Queries that grow with each user's history

**Problem.**

- `GET /practice/:mode/next` loads every past attempt of that mode to avoid repeating a topic, so
  it gets slower for the most active users.
- Progress and streaks are computed in the browser from the last 100 attempts, including their
  full feedback JSON: a heavy payload, and wrong numbers past 100 attempts.

**Still open.** A per-user stats row updated when an analysis completes, and topic selection
inside the query (`NOT IN` over a small per-user "seen topics" set).

### 2.6 Single points of failure

**Problem.** One Redis node holds the queue, rate limits, locks and schedules, with no replica.
Postgres runs in one availability zone, and there is one NAT gateway.

What each one takes down today:

- **NAT gateway** (one, in one AZ). Every container reaches the internet through it: Clerk,
  Deepgram, Anthropic and Paddle, and also ECR and Secrets Manager. If its AZ fails, running API
  tasks still answer requests that need only Postgres and Redis, but no recording gets analyzed,
  sign-ins that need Clerk fail, and **no new task can start** (it can't pull its image or read
  its secrets), so autoscaling and deploys stop too.
- **Redis** (one node). The queue, rate limits, per-user locks and the cleanup schedule. While
  it's down, nothing can be submitted or analyzed; with `noeviction`, a full Redis also refuses
  new jobs. The `redis-memory` alarm warns before that.
- **Postgres** (one AZ). Everything that reads or writes user data. RDS restores from backups
  (7 days), but a lost AZ means minutes to hours of downtime.

**Still open.** The plan for when there are paying users (`SPEC.md` §12), in this order, because
the NAT gateway is the cheapest fix for the widest outage:

| Step | Change (`infra/cdk/lib/speakup-stack.ts`)                     | Extra cost | Effect                                                 |
| ---- | ------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| 1    | `natGateways: 2`                                              | ~$33/month | each AZ keeps its own way out                          |
| 2    | Redis `numCacheClusters: 2`, `automaticFailoverEnabled: true` | ~$12/month | a replica in the other AZ takes over in about a minute |
| 3    | RDS `multiAz: true`                                           | ~$28/month | a standby in the other AZ takes over in 1–2 minutes    |

All three are config changes with no app changes, and each should update in place; still check
`cdk diff` for replacements before deploying.

## 3. What changes at 10× and 100×

| Load                                        | What breaks                                     | What we'd do                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Today** (up to ~1,000 practicing at once) | Spikes (cold start), provider rate limits       | Faster scale-out, scheduled minimum, admission control; confirm provider limits with a short real run                         |
| **10×** (~10,000 practicing)                | DB connections, single Redis, provider limits   | RDS Proxy, bigger DB class, read replica; Redis with failover; provider enterprise tiers; circuit breakers                    |
| **100×** (~100,000 practicing)              | Single primary DB, single region, provider cost | Queue separate from cache/limits, sharded queues per region, self-hosted Whisper for speech-to-text cost, partitioned history |
