import { createDbClient } from "@speakup/db";
import { ANALYSIS_QUEUE_NAME, ATTEMPT_EVENTS_CHANNEL } from "@speakup/shared";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { withChangeEvents } from "./attempt-events.js";
import { createFfmpegDecoder } from "./audio/decode.js";
import { cleanupFunnelSessions, createPrismaCleanupRepo } from "./cleanup.js";
import { loadRootDotEnv, parseEnv } from "./env.js";
import { PipelineError } from "./errors.js";
import { createClaudeSender } from "./feedback/claude.js";
import { createLogger } from "./logger.js";
import { runAnalysis, type PipelineDeps } from "./pipeline.js";
import { createDeepgramStt } from "./providers/deepgram.js";
import { createFakeLlm, createFakeStt } from "./providers/fake.js";
import { createCloudWatchSink, publishQueueDepth } from "./queue-metrics.js";
import { createPrismaRepo } from "./repo.js";
import { createS3AudioStorage } from "./storage.js";

/** Queue for scheduled housekeeping jobs (separate from analysis so they never wait behind it). */
const MAINTENANCE_QUEUE = "maintenance";

/**
 * BullMQ worker bootstrap. It pulls jobs from the `analysis` queue in Redis and runs
 * them through the pipeline. Retries/backoff are set by the producer (API) on each job
 * (apps/api/src/services/analysis-queue.ts), so this file only says *how* to process one.
 */
/** parseEnv already demands the keys for the real providers; this only narrows the type. */
function requireKey(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required with ANALYSIS_PROVIDERS=real`);
  return value;
}

function main(): void {
  loadRootDotEnv();

  let env;
  try {
    env = parseEnv(process.env);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const log = createLogger(env.NODE_ENV);
  const db = createDbClient(env.DATABASE_URL, { poolMax: env.DB_POOL_MAX });

  const storage = createS3AudioStorage({
    region: env.AWS_REGION,
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
  });
  const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
  // Announces attempt changes to API tasks holding a results request (long-polling).
  const publisher = new Redis(env.REDIS_URL);

  // Load tests swap the two paid providers for simulated ones (docs/load-testing.md).
  const fake = env.ANALYSIS_PROVIDERS === "fake";
  if (fake) {
    log.warn(
      {
        sttMedianMs: env.FAKE_STT_MEDIAN_MS,
        llmMedianMs: env.FAKE_LLM_MEDIAN_MS,
        failureRate: env.FAKE_FAILURE_RATE,
      },
      "FAKE ANALYSIS PROVIDERS: load-test mode, feedback is not real",
    );
  }
  const failureRate = env.FAKE_FAILURE_RATE;

  // Real implementations of the pipeline's dependencies (unit tests pass their own fakes).
  const deps: PipelineDeps = {
    repo: withChangeEvents(
      createPrismaRepo(db),
      async (attemptId) => {
        await publisher.publish(ATTEMPT_EVENTS_CHANNEL, JSON.stringify({ attemptId }));
      },
      log,
    ),
    storage,
    stt: fake
      ? createFakeStt({ medianMs: env.FAKE_STT_MEDIAN_MS, failureRate })
      : createDeepgramStt(requireKey(env.DEEPGRAM_API_KEY, "DEEPGRAM_API_KEY")),
    decoder: createFfmpegDecoder(env.FFMPEG_PATH),
    llm: fake
      ? createFakeLlm({ medianMs: env.FAKE_LLM_MEDIAN_MS, failureRate })
      : createClaudeSender({
          apiKey: requireKey(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
          model: env.ANTHROPIC_MODEL,
        }),
    prices: {
      sttUsdPerMin: env.PRICE_STT_USD_PER_MIN,
      llmInputUsdPerMTok: env.PRICE_LLM_INPUT_USD_PER_MTOK,
      llmOutputUsdPerMTok: env.PRICE_LLM_OUTPUT_USD_PER_MTOK,
    },
  };

  const worker = new Worker(
    ANALYSIS_QUEUE_NAME,
    async (job) => {
      // attemptsMade = tries that already failed; this run is number attemptsMade + 1.
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      try {
        // requestId (from the API) ties these logs to the HTTP request that queued the job.
        const requestId = (job.data as { requestId?: unknown }).requestId;
        const jobLog = log.child({
          jobId: job.id,
          ...(typeof requestId === "string" && { requestId }),
        });
        await runAnalysis(job.data, { isFinalAttempt }, deps, jobLog);
      } catch (err) {
        // A non-retryable failure (no speech, bad request…) must not use up the remaining
        // retries: UnrecoverableError tells BullMQ to fail the job right away.
        if (err instanceof PipelineError && !err.retryable) {
          throw new UnrecoverableError(`${err.code}: ${err.message}`);
        }
        throw err;
      }
    },
    {
      // BullMQ uses blocking Redis commands; it needs maxRetriesPerRequest=null so ioredis
      // doesn't give up on a long-blocking call and throw.
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  // Maintenance: a daily cleanup of unclaimed funnel sessions (SPEC §9). A BullMQ job scheduler
  // instead of a cron in the process: Redis holds the schedule, so with several worker
  // containers the job still runs ONCE per day (whichever worker picks it up), and
  // upsert makes restarts idempotent (no duplicate schedules).
  const maintenance = new Queue(MAINTENANCE_QUEUE, { connection });
  void maintenance
    .upsertJobScheduler(
      "funnel-cleanup",
      { pattern: "0 3 * * *", tz: "UTC" },
      { name: "funnel-cleanup" },
    )
    .catch((err: Error) => log.error({ err: err.message }, "could not schedule funnel cleanup"));
  const cleanupRepo = createPrismaCleanupRepo(db);
  const maintenanceWorker = new Worker(
    MAINTENANCE_QUEUE,
    async () => {
      await cleanupFunnelSessions({
        repo: cleanupRepo,
        storage,
        log: log.child({ job: "funnel-cleanup" }),
      });
    },
    { connection, concurrency: 1 },
  );
  maintenanceWorker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, err: err.message }, "maintenance job failed"),
  );

  worker.on("ready", () =>
    log.info({ queue: ANALYSIS_QUEUE_NAME, concurrency: env.WORKER_CONCURRENCY }, "worker ready"),
  );
  worker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, "job failed"),
  );
  worker.on("error", (err) => log.error({ err: err.message }, "worker error"));

  // Queue depth → CloudWatch every 30 s, for the worker autoscaling policy (infra/cdk).
  const analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, { connection });
  let metricsTimer: NodeJS.Timeout | undefined;
  if (env.QUEUE_METRICS_NAMESPACE) {
    const sink = createCloudWatchSink(env.AWS_REGION);
    const namespace = env.QUEUE_METRICS_NAMESPACE;
    const publish = () => void publishQueueDepth(analysisQueue, sink, namespace, log);
    publish();
    metricsTimer = setInterval(publish, 30_000);
  }

  // Graceful shutdown: let in-flight jobs finish instead of leaving them half-done.
  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down worker");
    clearInterval(metricsTimer);
    await Promise.all([
      worker.close(),
      maintenanceWorker.close(),
      maintenance.close(),
      analysisQueue.close(),
    ]);
    await db.$disconnect();
    publisher.disconnect();
    process.exit(0);
  };
  // Unknown state after an unhandled error: log and exit; the orchestrator restarts the worker,
  // and BullMQ hands any in-flight job to another worker (stalled-job detection).
  process.on("unhandledRejection", (reason) => {
    log.fatal({ err: reason }, "unhandled promise rejection — exiting");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    log.fatal({ err }, "uncaught exception — exiting");
    process.exit(1);
  });
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main();
