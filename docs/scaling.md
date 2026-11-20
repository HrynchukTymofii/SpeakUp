# Scaling: where SpeakUp breaks and what we do about it

How much load the system takes today, which component gives out first, and the changes that
move each limit. The numbers come from the load tests in [`load-testing.md`](./load-testing.md);
the architecture they refer to is in [`architecture.md`](./architecture.md).

> **Short version.** Browsing is cheap: one 0.5-vCPU API task served hundreds of requests per
> second at single-digit-millisecond latency. **Practicing is the limit.** One worker finishes
> ~55–60 recordings per minute no matter how many people are waiting. Past ~60 people
> practicing at once the queue grows, and at 120 people 23% of recordings got no feedback within
> 60 s. A bigger machine doesn't fix this, because the worker spends ~75% of each job _waiting_ on
> Deepgram and Claude, not computing. And while people wait, their browsers poll, which turns a
> worker problem into a database problem.

## Status (2026-11-20)

| Bottleneck (§2)                 | Status                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — fixed worker throughput     | **Done:** workers autoscale on queue depth (`QueueWaiting` metric, 1 → `workerMaxTasks`). Concurrency stays at 4 per task, because CPU reached ~66% of 0.5 vCPU at 4. On AWS: 4 workers handled 240 users (p95 14.8 s), and 1 → 13 workers in ~4 min drained a 664-job spike. **Open:** cold-start timeouts and admission control. |
| 2 — polling load                | **Done for web:** long-polling. The API answers the moment the worker announces a change (Redis pub/sub). Pending reads skip the transcript and feedback JSON, and the request user is cached for 60 s. **Open:** mobile push (APNs / FCM).                                                                                        |
| 3 — DB connections              | **Partly done:** `DB_POOL_MAX` (API 8, worker 3) and `speakup:dbInstanceSize`. **Open:** RDS Proxy.                                                                                                                                                                                                                                |
| 4 — quota race                  | **Done:** a per-user lock (`user-lock.ts`) serializes the check and the insert.                                                                                                                                                                                                                                                    |
| 5, 6 — history queries and SPOF | Open.                                                                                                                                                                                                                                                                                                                              |

**1,000 people practicing at once: not proven yet.** The 1,000-user AWS run
([`load-testing.md` run 6](./load-testing.md#run-6-practice-1000-users-queue-depth-autoscaling-from-1-worker-2026-11-20))
showed 0 server errors and working autoscaling. But the laptop running k6 couldn't generate the
traffic, so it doesn't count as a capacity measurement. By the math, 1,000 users is about 20
recordings/s, which needs ~22 workers, `workerMaxTasks ≥ 25` and a `db.t4g.small`. Run k6
from EC2 to confirm.

## 1. How the load flows

```
Browser ──1. create──► API ──► Postgres          (attempt row, quota check)
   │                    │
   └──2. upload───────► S3                       (pre-signed POST; audio never touches the API)
   │
   └──3. submit──────► API ──► Redis (BullMQ) ──► Worker ×1, 4 jobs at a time
   │                                                ├─ STT (Deepgram)     ~1 s   ┐ waiting
   │                                                ├─ ffmpeg, scoring, DB ~1 s  │ (I/O)
   │                                                ├─ LLM (Claude)       ~2 s   ┘
   │                                                └─ Postgres writes
   └──4. "done yet?" every 1.5 s, up to 60 s ──► API ──► Postgres
```

Audio already goes from the device straight to S3, on web and on mobile alike. The API only
signs the upload and checks it afterwards. So "record on the client and send it to us" is
already how it works, and it isn't where the limits are.

## 2. The bottlenecks, in the order they hit

Each one is a design problem: it doesn't go away with a bigger instance or a higher provider
tier.

### 1 — Worker throughput is fixed, and most of it is waiting

**Evidence** (practice scenario, step load 12 → 30 → 60 → 120 users; full table in
[`load-testing.md` §5](./load-testing.md#5-results)):

| Users practicing | Finished / min | Wait for feedback p50 / p95 | No result in 60 s |
| ---------------- | -------------- | --------------------------- | ----------------- |
| 12               | ~12            | 4.5 s / 6 s                 | 0%                |
| 30               | ~40            | 6 s / 7.5 s                 | 0%                |
| 60               | ~46            | 7.5 s / 15 s                | 0%                |
| 120              | ~55 (ceiling)  | 35–56 s / 50–60 s           | **23%**           |

Throughput flattens at ~1 job/s = 4 slots ÷ ~4.1 s per job. Of those 4.1 s, ~3 s is the two
provider calls. A 4-vCPU worker would sit at the same ceiling, because the slots are full of
waiting, not computing.

**Fixes:**

- **Concurrency is the cheap lever.** I/O-bound jobs can run many per process. We go from 4 to
  ~16 per task and keep an eye on memory (ffmpeg decodes a whole recording into RAM: ~1–4 MB per
  minute of audio).
- **Scale workers on queue depth, not CPU** (ECS step scaling on a custom CloudWatch metric,
  `waiting jobs ÷ workers`). CPU stays low while users wait, so CPU-based scaling would never
  trigger.
- **Admission control:** past a queue limit, `POST /attempts` answers "busy, try in a minute",
  instead of accepting work that will time out anyway. Pro users get a higher queue priority
  (BullMQ priorities).
- **Provider limits come next.** Once there are enough workers, Deepgram/Anthropic rate limits
  cap throughput. Enterprise tiers raise them, but outages still happen, so a circuit breaker
  stops calling a failing provider for a while instead of piling up retries.

### 2 — Polling turns a slow worker into database load

**Evidence:** in the practice run, **83% of all API requests were "is it done yet?" polls**
(6,474 of 7,806). Between minute 5 and minute 6 the worker finished the same ~55
recordings/min, but API traffic tripled (17 → 51 req/s) and Postgres transactions tripled
(93 → 269/s). That growth came only from people waiting longer. It's a feedback loop: a slower
worker means more polls, more DB load, slower worker writes, and slower results.

Each API request also costs ~3.6 Postgres transactions (browse scenario: 1,857 tx/s at 516
req/s). The auth hook looks the user up on **every** request, and most routes add an
entitlements query.

**Fixes:**

- **Push instead of poll — done for web as long-polling** (2026-11-20). After each status change
  the worker publishes the attempt id on Redis (`attempt-events`). Every API task subscribes, and
  the one holding `GET /attempts/:id?wait=20` for that attempt answers at once. A 10 s wait is
  now 1–2 requests instead of ~7 polls, and the result shows up the moment it's saved. Long-polling
  instead of SSE: it works with the existing `Authorization` header and React Query, needs no
  streaming through the ALB, and k6 can test it as is. While a request is held it uses no DB
  connection, only an idle socket. **Open:** push notifications (APNs/FCM) on mobile, which also
  let the user leave the screen.
- Also done: pending requests skip the transcript and analysis JSON, plus backoff
  (1.5 s → 3 s → 5 s) as the fallback when the API doesn't hold the request.
- **Cache the request user** (user id + plan) in Redis or process memory for ~60 s, so
  verifying a token doesn't need a DB round trip.

### 3 — More API/worker tasks multiply database connections

Every API or worker process keeps its own pool (node-postgres default: **10 connections**).
`db.t4g.micro` allows ~80–100 connections. 4 API tasks + N workers + migrations reach that
quickly, and a bigger database only raises the cap a little. Horizontal scaling is what runs out.

**Fix:** RDS Proxy (or PgBouncer) in front of Postgres, so thousands of client connections share
a few dozen real ones. Then a read replica for history and progress reads.

### 4 — The daily quota is check-then-insert

`POST /attempts` counts today's attempts and then inserts a new one. Parallel requests can all
see "under the limit". See scenario C in [`load-testing.md`](./load-testing.md) for the measured
result. Each attempt over the limit is a paid analysis nobody paid for.

**Fix:** make the check and the reservation one atomic step: `INCR` on a Redis key
`quota:{user}:{day}` with an expiry (and `DECR` when an attempt fails for a non-billable reason),
or a row lock in a DB transaction.

### 5 — Queries that grow with each user's history

- `GET /practice/:mode/next` loads **every** past attempt of that mode to avoid repeats, so it
  gets slower for the most active users.
- Progress and streaks are computed in the browser from the last 100 attempts, including their
  full feedback JSON. The payload is heavy, and the numbers are wrong past 100 attempts.

**Fix:** a per-user stats row updated when an analysis completes, and topic selection inside the
query (`NOT IN` over a small per-user "seen topics" set, or a bitmap).

### 6 — Single points of failure

One Redis node with no replica holds the queue, rate limits and schedules, and Postgres runs in
a single AZ. Both are config switches (`automaticFailoverEnabled`, `multiAz`) at about 2× their
cost, and are worth turning on once there are paying users.

## 3. What changes at 10× and 100×

| Load                                          | What breaks                                        | What we do                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Today** (~60 practicing at once)            | Worker queue                                       | Queue-depth autoscaling (done); admission control; push instead of poll                                                     |
| **10×** (~600 practicing, thousands browsing) | DB connections, polling load, provider rate limits | RDS Proxy; SSE/push; cached auth; atomic quota; bigger DB class; provider enterprise tiers; circuit breakers                |
| **100×** (~6,000 practicing)                  | Single primary DB, single Redis, provider cost     | Read replicas; Redis cluster (queue separate from rate limits); sharded queues per region; self-hosted Whisper for STT cost |

## 4. Interview questions this answers

- **"How many users can it handle?"** It depends on what they're doing. Browsing: hundreds of
  requests per second on one 0.5-vCPU task. Practicing: ~60 people at once on one worker,
  measured with k6. Then explain why those two numbers are so different.
- **"How do you scale the worker?"** Add concurrency first (the jobs are I/O-bound), then add
  tasks based on queue depth, because CPU is the wrong signal. Then admission control and
  priorities.
- **"How would you handle huge database load?"** Remove the requests that shouldn't exist (polls
  → push, per-request user lookups → cache), pool the connections (RDS Proxy), and move reads to
  replicas. A bigger instance comes last.
- **"How did you test it without paying for the AI providers?"** Fake providers with realistic
  latency distributions, everything else real, on a throwaway copy of the production stack.
