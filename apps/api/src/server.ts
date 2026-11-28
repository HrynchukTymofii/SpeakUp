import type { Writable } from "node:stream";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { DbClient } from "@speakup/db";
import { ErrorCode, logRedactPaths, REDACT_CENSOR } from "@speakup/shared";
import type { Redis } from "ioredis";
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Env } from "./env.js";
import { requireAuth } from "./plugins/auth.js";
import { AppError, setupErrorHandling } from "./plugins/error-handler.js";
import type { ErrorReporter } from "./services/error-reporter.js";
import { healthRoutes, type HealthChecks } from "./routes/health.js";
import { courseRoutes } from "./routes/courses.js";
import { meRoutes } from "./routes/me.js";
import { attemptRoutes } from "./routes/attempts.js";
import type { AttemptEvents } from "./services/attempt-events.js";
import { billingPublicRoutes, billingRoutes } from "./routes/billing.js";
import { funnelClaimRoutes, funnelGuestRoutes } from "./routes/funnel.js";
import { funnelPublicRoutes } from "./routes/funnels.js";
import { webhookRoutes } from "./routes/webhooks.js";
import type { AnalysisQueue } from "./services/analysis-queue.js";
import type { AuthProvider } from "./services/auth-provider.js";
import type { BotCheck } from "./services/bot-check.js";
import type { PaymentProvider } from "./services/payments/types.js";
import type { RateLimiter } from "./services/rate-limiter.js";
import type { KeyedLock } from "./services/user-lock.js";
import type { Storage } from "./services/storage.js";

export interface ServerDeps {
  env: Env;
  db: DbClient;
  auth: AuthProvider;
  storage: Storage;
  queue: AnalysisQueue;
  botCheck: BotCheck;
  rateLimiter: RateLimiter;
  /** Per-key locks shared by all API tasks (Redis in prod, in-memory in tests). */
  locks: KeyedLock;
  /** Worker announcements for long-polling results (Redis pub/sub in prod, in-memory in tests). */
  attemptEvents: AttemptEvents;
  /** Null when billing isn't configured (local dev without Paddle keys). */
  payments: PaymentProvider | null;
  healthChecks: HealthChecks;
  /** Shared store for the global per-IP rate limit. Omitted in tests → in-memory store. */
  rateLimitRedis?: Redis;
  /** Unexpected 5xx go here (Sentry in prod). Omitted → not reported. */
  errorReporter?: ErrorReporter;
  /** Tests only: capture log output to check redaction. */
  logStream?: Writable;
}

/** JSON bodies we accept are small; anything bigger is a mistake or an attack (→ 413). */
const BODY_LIMIT_BYTES = 100 * 1024;

/**
 * Builds the Fastify app without starting it.
 * Dependencies are passed in (not imported as globals) so tests can call
 * `buildServer(...)` with fakes and use `app.inject()` — no real network, DB or Redis needed.
 */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { env } = deps;
  const app = Fastify({
    logger: {
      level: deps.logStream ? "info" : env.NODE_ENV === "test" ? "silent" : "info",
      // Human-readable logs in dev; plain JSON in prod so log tooling can parse it.
      ...(env.NODE_ENV === "development" &&
        !deps.logStream && { transport: { target: "pino-pretty" } }),
      ...(deps.logStream && { stream: deps.logStream }),
      // Never log credentials, emails, transcripts or audio URLs (SPEC §9) — enforced here,
      // not left to every log call (shared list in @speakup/shared/logging).
      redact: { paths: logRedactPaths(), censor: REDACT_CENSOR },
    },
    bodyLimit: BODY_LIMIT_BYTES,
    // Every log line for a request carries the same id; clients can send their own.
    requestIdHeader: "x-request-id",
    // In production the API runs behind a load balancer: request.ip must come from
    // X-Forwarded-For (per-IP limits). Trust exactly TRUST_PROXY_HOPS hops (ALB = 1): the ALB
    // appends the real client IP, anything further left was written by the client and could
    // be faked. `hop` counts from the socket outwards (0 = the ALB itself). Locally there is
    // no proxy, so the header is ignored entirely.
    trustProxy:
      env.NODE_ENV === "production"
        ? (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS
        : false,
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas on routes validate input and serialize output.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  setupErrorHandling(app, deps.errorReporter);

  await app.register(helmet);
  // @fastify/cors only allows GET/HEAD/POST by default; the web app also sends PUT and PATCH.
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Global per-IP rate limit (SPEC §9), counted in Redis so it holds across all API instances.
  // Routes opt out with `config: { rateLimit: false }` (health checks, provider webhooks).
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    ...(deps.rateLimitRedis && { redis: deps.rateLimitRedis, nameSpace: "ratelimit:ip:" }),
    // If Redis is down, serve requests rather than failing them all.
    skipOnError: true,
    // Thrown → our error handler → the standard error body (+ Retry-After set by the plugin).
    errorResponseBuilder: (_request, context) =>
      new AppError(
        context.statusCode,
        ErrorCode.RATE_LIMITED,
        `Too many requests. Please try again in ${context.after}.`,
      ),
  });

  // Public routes.
  await app.register(healthRoutes, { checks: deps.healthChecks });

  // Provider webhooks (signature-verified, raw body) and public billing info.
  await app.register(webhookRoutes, { prefix: "/v1", db: deps.db, payments: deps.payments });
  await app.register(billingPublicRoutes, { prefix: "/v1", payments: deps.payments });
  // Published funnel definitions: anonymous visitors load them before any session exists.
  await app.register(funnelPublicRoutes, { prefix: "/v1", db: deps.db });

  // Anonymous funnel routes: no Clerk session, a guest token instead (SPEC §7).
  await app.register(funnelGuestRoutes, {
    prefix: "/v1",
    db: deps.db,
    storage: deps.storage,
    queue: deps.queue,
    botCheck: deps.botCheck,
    rateLimiter: deps.rateLimiter,
    ipDailyLimit: env.FUNNEL_IP_DAILY_LIMIT,
    ipHashSecret: env.IP_HASH_SECRET,
  });

  // /v1 routes that require a signed-in user. Fastify scopes ("encapsulation") mean the
  // auth hook added here applies only to routes registered inside this function.
  await app.register(
    async (authed) => {
      requireAuth(authed, { auth: deps.auth, db: deps.db });
      const limits = { free: env.FREE_DAILY_ANALYSES, pro: env.PRO_DAILY_ANALYSES };
      await authed.register(meRoutes, { db: deps.db, env });
      await authed.register(courseRoutes, { db: deps.db, limits });
      await authed.register(attemptRoutes, {
        db: deps.db,
        storage: deps.storage,
        queue: deps.queue,
        limits,
        rateLimiter: deps.rateLimiter,
        attemptsPerMinute: env.ATTEMPTS_PER_MINUTE,
        locks: deps.locks,
        events: deps.attemptEvents,
      });
      await authed.register(funnelClaimRoutes, { db: deps.db });
      await authed.register(billingRoutes, { db: deps.db, payments: deps.payments, limits });
    },
    { prefix: "/v1" },
  );

  return app;
}
