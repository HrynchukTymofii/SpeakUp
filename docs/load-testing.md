# Load testing

How we measure how much traffic SpeakUp can take, and where it breaks. This file is the
**method and the raw results**. What the results mean for the architecture, and what we change
because of them, is in [`scaling.md`](./scaling.md).

## 1. The question

How many people can use SpeakUp **at the same time** before the experience gets worse, and
which component gives out first? Two kinds of users load the system very differently:

| Kind of user                                                                | What it loads                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Browsing**: opens the app, looks at courses, history, the next topic      | API + Postgres reads                                                |
| **Practicing**: records an answer and waits for feedback (the core product) | API, S3 upload, Redis queue, worker (ffmpeg + 2 AI calls), Postgres |

So there is not one number. There is a browse capacity and a practice capacity, and the practice
one is much lower.

## 2. What we test with, and what we fake

**Tool: [k6](https://k6.io)** (Grafana, open source, free). Scenarios are JavaScript files in
[`load-tests/`](../load-tests). Each _virtual user_ (VU) runs the same steps as a real person,
with pauses for reading and recording, so 100 VUs ≈ 100 people using the app at once.

**The paid AI providers are simulated.** A real test would call Deepgram and Claude thousands of
times (about 1–2 cents per recording). The worker has a load-test mode,
`ANALYSIS_PROVIDERS=fake` ([`apps/worker/src/providers/fake.ts`](../apps/worker/src/providers/fake.ts)):

- No network calls, no API keys, $0 in provider cost.
- Each call **waits as long as the real one would**: a log-normal delay around a median
  (Deepgram 1 s, Claude 2 s by default, from our production logs), so p99 ≈ 2.5× the median.
  A fixed delay would hide the tail that real p99s come from.
- Optional failure rate (`FAKE_FAILURE_RATE`): retryable errors, like a provider 429/5xx.
- Results are stored with `llmModel = "fake-llm"` and the worker logs a warning at boot, so fake
  feedback can never pass for real.

**Everything else is real**: S3 uploads with pre-signed POSTs, the BullMQ queue, ffmpeg decoding,
pitch/pause analysis, scoring, Postgres writes, client polling. Those are what we're measuring.

**Sign-in is replaced.** Clerk session tokens expire every 60 s, and minting thousands of them
would measure Clerk's rate limits, not our API. With `LOAD_TEST_AUTH_SECRET` set, the API also
accepts HMAC-signed `lt.<userId>.<sig>` tokens
([`apps/api/src/services/load-test-auth.ts`](../apps/api/src/services/load-test-auth.ts)).
Safeguards:

- These tokens only work for `loadtest_*` user ids. Clerk ids are `user_*`, so even a leaked
  secret can't act as a real user.
- Production refuses the secret unless `LOAD_TEST_STACK=true` is also set, and only the throwaway
  stack sets that.

The API still verifies a signature, looks up or creates the user, and runs every query, as it
does for a real token.

**Limits we lift on purpose** (only in the test environments): the per-IP rate limit (k6 sends
everything from one IP) and the daily free quota (each VU records dozens of times). The quota
itself gets its own test (scenario C).

## 3. Scenarios

| File                                                               | Simulates                                                                                                                                                                                            | Measures                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`scenarios/browse.js`](../load-tests/scenarios/browse.js)         | A. Opening the app: `/me`, `/courses`, practice list, history, next topic, with 1–8 s pauses                                                                                                         | API + DB read capacity                                    |
| [`scenarios/practice.js`](../load-tests/scenarios/practice.js)     | B. The full recording loop, exactly like the browser: next topic → think 5–10 s → record 15 s → create attempt → upload to S3 → submit → **poll every 1.5 s for up to 60 s** → read feedback 15–30 s | Time until the user sees feedback, queue depth, poll load |
| [`scenarios/quota-race.js`](../load-tests/scenarios/quota-race.js) | C. A user firing 10 "create recording" requests at the same instant                                                                                                                                  | Whether the daily quota holds under concurrency           |

Load shapes ([`lib/profiles.js`](../load-tests/lib/profiles.js)), chosen with `-e PROFILE=` and
scaled with `-e PEAK=`:

- `smoke`: 1 user, 2 min. Checks that the script works. Always run it first.
- `steps`: 10% → 25% → 50% → 100% of PEAK, each level held 1 min. Each level gets its own
  steady-state numbers, and the level where things degrade is the limit.
- `spike`: 0 → PEAK in 10 s. Shows queueing and how slowly autoscaling reacts.
- `soak`: PEAK held for 15 min. Finds leaks and connection exhaustion.

**Key metrics:**

- `result_wait_ms`: submit → result visible, the number the user actually feels. It's measured
  with 1.5 s polling, so it's accurate to ±1.5 s.
- `result_timeouts`: share of recordings with no result after 60 s.
- `http_req_duration` per endpoint, and `http_req_failed`.
- `result_polls`: "done yet?" requests. Since long-polling (2026-11-20) the scenario waits
  like the web app (`?wait=20`). `-e POLL=backoff` / `-e POLL=fixed` replay the older clients
  for comparison.
- Queue depth and Postgres connections/transactions, from
  [`sample-local.sh`](../load-tests/sample-local.sh) locally and from CloudWatch on AWS.

## 4. How to run it

### Locally (free)

```bash
pnpm infra:up                                   # Postgres, Redis, S3 (Docker)
export DATABASE_URL=postgresql://speakup:speakup@localhost:5433/speakup
pnpm db:migrate:deploy && pnpm db:seed
pnpm turbo run build --filter=@speakup/api --filter=@speakup/worker

# Two terminals: API on :4100 and the worker, both with the load-test env
set -a; . load-tests/env/local.env; set +a; node apps/api/dist/index.js
set -a; . load-tests/env/local.env; set +a; node apps/worker/dist/index.js

# Third terminal: sample queue + DB while k6 runs
load-tests/sample-local.sh 2 > samples.csv

k6 run -e LOAD_TEST_AUTH_SECRET=local-load-test-secret-0123456789abcdef \
  -e PROFILE=smoke load-tests/scenarios/practice.js
```

[`load-tests/env/local.env`](../load-tests/env/local.env) holds only dummy local values. It uses
Redis **database 5**, so a dev worker on the same Redis never picks up load-test jobs.
Local numbers depend on the laptop (k6, API, worker and databases all share one CPU), so they're
good for finding _which_ part breaks first and _why_, but they're not production capacity.

### On AWS (the real numbers)

A separate, throwaway CloudFormation stack built from the same CDK code with
`-c speakup:loadTest=true` → stack **`SpeakUp-LoadTest`**:

- Same topology and sizes as production: ALB, API on Fargate (0.5 vCPU / 1 GB, autoscaling
  1–4 on CPU), workers with concurrency 4 that autoscale on queue depth from 1 up to
  `speakup:workerMaxTasks` (25 from `cdk.json`, 10 without it), RDS `db.t4g.small` (`micro`
  without `speakup:dbInstanceSize`), ElastiCache `cache.t4g.micro`.
  For 1,000 users, deploy with `-c speakup:workerMaxTasks=30 -c speakup:dbInstanceSize=small`.
  30 workers plus 4 API tasks need 17 Fargate vCPUs, and the account quota is 30.
- **Run k6 from inside AWS for big runs.** Past a few hundred users, a laptop on a home
  connection becomes the bottleneck (run 6 below). No extra infrastructure is needed: package
  the scenario and run the official k6 image as a one-off Fargate task (see "k6 in AWS" below).
- The worker runs `ANALYSIS_PROVIDERS=fake` and has no Deepgram/Anthropic keys at all.
- Its own generated secrets (`speakup-loadtest/app`, `speakup-loadtest/db`). It never reads
  production's.
- No deletion protection, buckets auto-emptied, no backups, so `cdk destroy` removes everything.
- A different stack name, so it can't update production. The production template synthesizes
  identically with or without this code (checked with a template diff).

```bash
cd infra/cdk
npx cdk deploy SpeakUp-LoadTest -c speakup:loadTest=true --require-approval never
# migrate + seed: run the MigrateCommand output, then again with the seed override (README "Deploy")
SECRET=$(aws secretsmanager get-secret-value --secret-id speakup-loadtest/app \
  --query SecretString --output text | jq -r .LOAD_TEST_AUTH_SECRET)
k6 run -e BASE_URL=<ApiLoadBalancerUrl output> -e LOAD_TEST_AUTH_SECRET=$SECRET \
  -e PROFILE=steps -e PEAK=200 load-tests/scenarios/practice.js
npx cdk destroy SpeakUp-LoadTest -c speakup:loadTest=true --force   # same day!
```

Cost while it runs: about $0.20–0.30/hour idle (NAT, ALB, RDS, Redis, Fargate), plus about
$0.025/hour for each extra worker while autoscaling has it running. Provider cost: $0. **Destroy
it the same day.** A stack left running overnight on 2026-11-19 cost a few dollars. If an
update leaves it in `UPDATE_ROLLBACK_FAILED`, `aws cloudformation delete-stack` still works.

## 5. Results

All runs on 2026-11-20, code at the `test/load-testing` branch. Tables come from
`node load-tests/analyze.mjs raw.csv samples.csv`. Minutes are wall-clock minutes of the run, so
during ramps the user count in a row is the maximum reached in that minute.

### Local runs (laptop: 12 cores, k6 + API + worker + Docker on the same machine)

Same sizes as production where it matters: **one API process, one worker with concurrency 4,
fake providers with 1 s / 2 s medians**. Postgres 16, Redis 7 and LocalStack S3 run in Docker.

#### Run 1: practice, steps to 120 users

`k6 run -e PROFILE=steps -e PEAK=120 scenarios/practice.js`

| min | users | API req/s | API p95 ms | polls % | finished | timeouts | wait p50 s | wait p95 s | queue max | PG tx/s |
| --- | ----- | --------- | ---------- | ------- | -------- | -------- | ---------- | ---------- | --------- | ------- |
| 1   | 12    | 1.3       | 22         | 47      | 12       | 0        | 4.5        | 6.0        | 2         | 9       |
| 2   | 29    | 1.8       | 21         | 42      | 12       | 0        | 6.0        | 6.0        | 5         | 12      |
| 3   | 30    | 4.3       | 20         | 54      | 39       | 0        | 6.0        | 7.5        | 6         | 27      |
| 4   | 60    | 9.6       | 18         | 66      | 46       | 0        | 7.5        | 15.1       | 20        | 54      |
| 5   | 119   | 17.3      | 17         | 76      | 57       | 0        | 21.1       | 24.1       | 29        | 93      |
| 6   | 120   | 50.6      | 11         | 92      | 54       | 0        | 34.6       | 49.7       | 81        | 269     |
| 7   | 120   | 39.8      | 8          | 97      | 80       | 68       | 55.8       | 60.3       | 80        | 205     |

Whole run: 300 recordings, **68 (22.7%) without a result after 60 s**, p95 wait 51.9 s, 0 HTTP
errors, `POST /attempts` p95 20.7 ms. **6,474 of 7,806 API requests (83%) were polls.** Worker
processing time per job (`Analysis.latencyMs`, n = 309): p50 4.1 s, p95 6.3 s.

What it shows:

1. **The worker caps out at ~55–60 recordings per minute** (4 slots ÷ ~4.1 s). From ~60 users
   on, the queue grows, waits grow, and from minute 7 people time out. The "finished" count in
   the last minute includes the drain after load stopped.
2. **The API is never the problem here**: p95 stays under 25 ms throughout.
3. **Polling amplifies the backlog.** Minutes 5 and 6 complete the same work, but API traffic
   triples and Postgres transactions nearly triple, only because people wait longer.
4. Of the ~4.1 s per job, ~3 s is the (simulated) provider calls, so more CPU wouldn't help.

#### Run 2: browse, steps to 1,500 users (normal pauses)

`k6 run -e PROFILE=steps -e PEAK=1500 scenarios/browse.js`

| min | users | API req/s | API p95 ms | PG tx/s |
| --- | ----- | --------- | ---------- | ------- |
| 1   | 150   | 40.8      | 10         | 154     |
| 2   | 366   | 74.1      | 9          | 282     |
| 3   | 375   | 128.6     | 7          | 465     |
| 4   | 750   | 231.4     | 7          | 848     |
| 5   | 1472  | 333.4     | 8          | 1197    |
| 6   | 1500  | 515.6     | 8          | 1857    |
| 7   | 1500  | 172.1     | 7          | 528     |

89,760 requests, **0 errors, p95 7.8 ms**. 1,500 people browsing is easy. One cost stands out:
**~3.6 Postgres transactions per API request** (1,857 tx/s at 516 req/s), because the auth hook
looks the user up on every request and most routes add an entitlements query.

#### Run 3: browse with 20× shorter pauses, steps to 1,000 users (finding the API ceiling)

`k6 run -e PROFILE=steps -e PEAK=1000 -e THINK=0.05 scenarios/browse.js`

| min | users | API req/s | API p95 ms | PG tx/s |
| --- | ----- | --------- | ---------- | ------- |
| 1   | 100   | 384.9     | 13         | 1674    |
| 2   | 244   | 688.0     | 73         | 2785    |
| 3   | 250   | 571.3     | 192        | 3507    |
| 4   | 500   | 957.4     | 513        | 3399    |
| 5   | 982   | 46.0      | 479        | –       |
| 6   | 1000  | 477.1     | 1334       | 3484    |
| 7   | 1000  | 495.8     | 966        | 2977    |

**The single API process tops out at ~700–950 req/s.** Postgres plateaus at ~3,500 tx/s, and p95
goes from 13 ms to ~1 s. 1.07% of requests failed, all at the TCP level (`connection refused` and
dial timeouts in k6: the API's accept queue was full). The API logged 0 errors and no request
got a 5xx. Postgres used ~0.75 of a core and held **12 connections the whole time = the API's
10-connection pool + 2**. So requests were queueing for a pool connection and for the one Node
thread, not waiting on Postgres. (The minute-5 dip is k6 itself stalling while it started 500
VUs on the same laptop.) Treat this ceiling as a lower bound: k6 and the API shared one machine.

#### Run 4: the quota race

`k6 run -e BASE_URL=<API with FREE_DAILY_ANALYSES=3> -e QUOTA=3 -e BURST=10 -e USERS=20 scenarios/quota-race.js`

20 fresh users, each with a free quota of **3** per day, each fire **10** `POST /attempts` at
the same instant. Result: **120 accepted instead of 60**. Every user got 6 recordings instead
of 3. The check (count today's attempts) and the insert are separate steps, so parallel
requests all pass the check before any of them inserts. The per-user rate limit (10/min) doesn't
help, because the burst is within it. Fix: [`scaling.md` §2.4](./scaling.md).

### AWS runs (`SpeakUp-LoadTest` stack, fake providers, k6 on the owner's laptop)

#### Run 5: practice, 240 users, 4 workers (night of 2026-11-19)

Run with the worker count set to 4 by hand, before autoscaling existed: **240 people practicing,
0 timeouts, p95 wait 14.8 s**, so throughput grows linearly with workers (4 × ~55–60/min).
Worker CPU peaked at ~66% of 0.5 vCPU with 4 jobs per task. That's why per-task concurrency
stays at 4 and we add tasks instead. (The raw k6 output was lost to a reboot. These numbers come
from the `perf/worker-autoscaling` commit message and CloudWatch.)

#### Run 6: practice, 1,000 users, queue-depth autoscaling from 1 worker (2026-11-20)

`k6 run -e PROFILE=soak -e PEAK=1000 scenarios/practice.js`: 1,000 users within 1 min, held for
15 min. The stack was deployed with `workerMaxTasks=30, dbInstanceSize=small`, and workers
start at 1.

| min  | users | API req/s | API p95 ms   | finished | timeouts | wait p50 s | wait p95 s | workers | queue waiting (max) |
| ---- | ----- | --------- | ------------ | -------- | -------- | ---------- | ---------- | ------- | ------------------- |
| 1    | 982   | 89        | 1,281        | 31       | 0        | 16.8       | 31.9       | 1       | 103                 |
| 2    | 1000  | 171       | 1,602        | 443      | 411      | 50.3       | 60.8       | 7       | 664                 |
| 3    | 1000  | 90        | 298          | 270      | 270      | –          | –          | 7 → 13  | 596                 |
| 4    | 1000  | 107       | 199          | 122      | 100      | 61.1       | 62.9       | 13      | 223                 |
| 5    | 1000  | 94        | 211          | 415      | 0        | 6.7        | 21.7       | 13      | 1                   |
| 6    | 1000  | 88        | 271          | 133      | 0        | 4.9        | 7.0        | 13      | 64                  |
| 7    | 1000  | 77        | 703          | 347      | 0        | 5.2        | 9.9        | 13      | 0                   |
| 8–17 | 1000  | 34–89     | 0.7 s – 40 s | 0–560    | 0–9      | –          | –          | –       | 0–374               |

Whole run: 90,305 requests and 2,722 recordings submitted. **0 failed analyses and 0 server
errors** (ALB: no 5xx, no rejected connections). RDS CPU stayed ≤ 18% with ≤ 47 connections.

**This run does not establish 1,000-user capacity.** From minute 2, **the load generator was
the bottleneck, not AWS**:

- 38% of k6 requests failed with connection timeouts on the laptop: Windows "connected host has
  failed to respond", and k6 errors 1101, 1213 and 1200. 80% of S3 uploads were among them.
- The ~10,000 `409` responses on submit are a consequence: the upload never arrived, so the API
  correctly refused the submit.
- ALB traffic peaked at 163 req/s and then fell, and a CLI sampler on the same laptop lost its
  connection to AWS at the same time.
- About 20 recordings/s, each with a create, a 70 KB upload, a submit and several polls, all
  from one home connection through an antivirus that inspects plain HTTP, was more than the
  laptop delivered.

What it does show:

1. **Queue-depth autoscaling works.** Workers went 1 → 7 → 13 within ~4 min of the spike, and a
   664-job backlog drained in ~3 min. Once scaled, waits were back to p50 5–7 s and p95 7–22 s,
   with 0 timeouts (minutes 5–7).
2. **Cold start is the real gap.** 781 recordings (29%) timed out in minutes 2–4, while the
   workers were still starting. Going 0 → 1,000 users in a minute is faster than step scaling
   plus Fargate start-up (~1 min each). Options:
   - a higher minimum when traffic is predictable (scheduled scaling)
   - bigger first steps
   - admission control ("busy, try in a minute")
   - a client wait longer than 60 s
3. **Open question.** In minutes 8–15 the ALB's p95 target response time reached 2–9 s, while
   the single API task's CPU was 20–60% and RDS sat idle. API autoscaling (CPU ≥ 60%) never
   added a second task. Repeat with a valid load generator before drawing conclusions.

#### Run 7: practice, 1,000 users, k6 inside AWS, long-polling (2026-11-20)

Code: `feat/result-push` (long-polling results). Stack: `workerMaxTasks=30`, `db.t4g.small`.
k6 ran as a Fargate task (4 vCPU / 8 GB) in us-east-1, with the soak profile at PEAK 1,000.
It ran twice back to back.

**7a: cold start, workers starting at 1** (~10 min, stopped by hand). Autoscaling did its job,
but too slowly for a 0 → 1,000 jump in one minute:

- Desired workers went 1 → 7 → 11 → 16 → 19 → 24 → 27 over ~10 min.
- Running workers lagged another 1–2 min behind that.
- The queue peaked at ~1,800 waiting jobs. **98.8% of the ~5,000 recordings got no result within
  60 s.**
- Everything else held up: 1 failed upload in 5,709, 0 failed analyses, and `POST /attempts` p95
  was 95 ms. The worker queue was the only bottleneck.

**7b: the same 1,000 users with ~25 workers already running** (~8 min):

| Metric                                   | Result                                   |
| ---------------------------------------- | ---------------------------------------- |
| Recordings analyzed                      | **9,095** (~1,060 / min, ~17.7 / s)      |
| No result within 60 s                    | **0**                                    |
| Failed analyses                          | **0**                                    |
| Submit → result visible, p50 / p95 / p99 | **4.2 s / 8.4 s / 10.7 s**               |
| HTTP errors                              | 2 of 50,801 (two dial timeouts)          |
| `POST /attempts` p95                     | 185 ms                                   |
| "Done yet?" requests per recording       | **1.5** (long-polling; ~7+ with polling) |
| RDS CPU (peak, `db.t4g.small`)           | 21%                                      |

**1,000 people practicing at once works**, with ~25 workers. What's left is getting to 25
workers fast enough when the load arrives all at once ([`scaling.md`](./scaling.md) status).

### k6 in AWS

The load generator runs as a one-off Fargate task with the official `grafana/k6` image. Nothing
to install or keep around:

```bash
# 1. Package the scenario with its fixtures. Env values baked in here WIN over -e at run time,
#    so bake in the profile you want (that's how 7a/7b both became the 1,000-user soak).
k6 archive -e PROFILE=soak -e PEAK=1000 -e LOAD_TEST_AUTH_SECRET=placeholder   -O practice.tar load-tests/scenarios/practice.js
aws s3 cp practice.tar s3://<MediaBucket output>/loadgen/practice.tar
URL=$(aws s3 presign s3://<MediaBucket output>/loadgen/practice.tar --expires-in 7200)

# 2. A task definition: grafana/k6:<same version as local k6>, 4096 CPU / 8192 MB,
#    entryPoint ["sh","-c"], nofile ulimit 65536, logs to the stack's Migrate log group,
#    execution role = the stack's MigrateTask execution role.
aws ecs register-task-definition --cli-input-json file://k6-taskdef.json

# 3. Run it from the default VPC with a public IP (the stack's private subnets work too)
aws ecs run-task --cluster <cluster> --task-definition speakup-loadtest-k6 --launch-type FARGATE   --network-configuration "awsvpcConfiguration={subnets=[<default subnets>],securityGroups=[<default sg>],assignPublicIp=ENABLED}"   --overrides '{"containerOverrides":[{"name":"k6","command":["wget -qO /tmp/t.tar \"$URL\" && k6 run --quiet --no-color -e BASE_URL=<ApiLoadBalancerUrl> -e LOAD_TEST_AUTH_SECRET=<secret> /tmp/t.tar"]}]}'

# 4. The k6 summary lands in CloudWatch Logs (stream k6/k6/<task id>).
#    Afterwards: aws ecs deregister-task-definition, then destroy the stack.
```

On Windows, set `PYTHONUTF8=1` before reading those logs with the AWS CLI (k6's summary has
block characters the console codepage can't print).
