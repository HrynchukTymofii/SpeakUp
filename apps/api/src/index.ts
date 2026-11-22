import { createDbClient } from "@speakup/db";
import { Redis } from "ioredis";
import { loadRootDotEnv, parseEnv } from "./env.js";
import { buildServer } from "./server.js";
import { createBullAnalysisQueue } from "./services/analysis-queue.js";
import { createClerkAuthProvider } from "./services/auth-provider.js";
import { createTurnstileBotCheck } from "./services/bot-check.js";
import { withLoadTestAuth } from "./services/load-test-auth.js";
import { createPaddleProvider } from "./services/payments/paddle.js";
import { createRedisRateLimiter } from "./services/rate-limiter.js";
import { createRedisAttemptEvents } from "./services/attempt-events.js";
import { createErrorReporter } from "./services/error-reporter.js";
import { createS3Storage } from "./services/storage.js";
import { createRedisKeyedLock } from "./services/user-lock.js";

/**
 * Process entry point: load + validate config, connect dependencies, start listening,
 * and shut down cleanly on SIGINT/SIGTERM (ECS sends SIGTERM before stopping a task).
 */
async function main(): Promise<void> {
  loadRootDotEnv();

  let env;
  try {
    env = parseEnv(process.env);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const errorReporter = createErrorReporter({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    service: "api",
  });

  // One DB client and one Redis connection per process, shared by all requests.
  const db = createDbClient(env.DATABASE_URL, { poolMax: env.DB_POOL_MAX });
  const redis = new Redis(env.REDIS_URL);
  // A subscribed connection can't run other commands, so pub/sub gets its own.
  const subscriber = new Redis(env.REDIS_URL);
  const attemptEvents = await createRedisAttemptEvents(subscriber);
  const queue = createBullAnalysisQueue(env.REDIS_URL);
  const storage = createS3Storage({
    region: env.AWS_REGION,
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
  });
  const clerkAuth = createClerkAuthProvider({
    secretKey: env.CLERK_SECRET_KEY,
    // Only accept tokens minted for our own web origins.
    authorizedParties: env.CORS_ORIGINS,
  });
  // Load tests only: also accept signed tokens for loadtest_* users (docs/load-testing.md).
  const auth = env.LOAD_TEST_AUTH_SECRET
    ? withLoadTestAuth(clerkAuth, env.LOAD_TEST_AUTH_SECRET)
    : clerkAuth;

  // Billing is optional in dev: without all three Paddle values the billing routes answer 503.
  const payments =
    env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET && env.PADDLE_PRICE_ID_PRO_MONTHLY
      ? createPaddleProvider({
          apiKey: env.PADDLE_API_KEY,
          webhookSecret: env.PADDLE_WEBHOOK_SECRET,
          priceIdProMonthly: env.PADDLE_PRICE_ID_PRO_MONTHLY,
          environment: env.PADDLE_ENV,
        })
      : null;

  const app = await buildServer({
    env,
    errorReporter,
    db,
    auth,
    storage,
    queue,
    botCheck: createTurnstileBotCheck(env.TURNSTILE_SECRET_KEY),
    rateLimiter: createRedisRateLimiter(redis),
    locks: createRedisKeyedLock(redis),
    attemptEvents,
    payments,
    rateLimitRedis: redis,
    healthChecks: {
      db: async () => {
        await db.$queryRaw`SELECT 1`;
      },
      redis: async () => {
        await redis.ping();
      },
    },
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close(); // stops accepting connections, finishes in-flight requests
    await queue.close();
    await db.$disconnect();
    redis.disconnect();
    subscriber.disconnect();
    await errorReporter.flush(2000);
    process.exit(0);
  };
  // A promise rejection nobody handled means the process is in an unknown state. Log it and
  // exit; the orchestrator (ECS) starts a fresh container. Staying up half-broken is worse.
  // Report first: these are exactly the errors worth a stack trace in Sentry.
  const crash = (err: unknown, message: string) => {
    app.log.fatal({ err }, message);
    errorReporter.capture(err, { kind: "crash" });
    void errorReporter.flush(2000).finally(() => process.exit(1));
  };
  process.on("unhandledRejection", (reason) => {
    crash(reason, "unhandled promise rejection — exiting");
  });
  process.on("uncaughtException", (err) => {
    crash(err, "uncaught exception — exiting");
  });
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  // 0.0.0.0 so the API is reachable from outside its container in Docker/ECS.
  if (env.LOAD_TEST_AUTH_SECRET) {
    app.log.warn("LOAD-TEST AUTH ENABLED: signed loadtest_* tokens are accepted");
  }
  await app.listen({ host: "0.0.0.0", port: env.API_PORT });
}

void main();
