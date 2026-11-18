import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * A dependency check: resolves if the dependency is reachable, throws otherwise.
 * A narrow function type (instead of passing the whole Redis/Prisma client) keeps
 * this route decoupled from the clients and makes tests trivial.
 */
export type HealthCheck = () => Promise<void>;

export interface HealthChecks {
  db: HealthCheck;
  redis: HealthCheck;
}

type CheckResult = "ok" | "fail";

async function runCheck(name: string, check: HealthCheck, log: FastifyBaseLogger) {
  try {
    await check();
    return "ok" satisfies CheckResult;
  } catch (err) {
    log.warn({ err, dependency: name }, "readiness check failed");
    return "fail" satisfies CheckResult;
  }
}

/**
 * Two probes, as used by load balancers / ECS:
 * - /health        liveness: "is the process up?" Never touches dependencies, so a DB/Redis
 *                  outage doesn't make the orchestrator kill otherwise healthy API containers.
 * - /health/ready  readiness: "can it serve traffic?" Checks Postgres and Redis (in parallel).
 */
export const healthRoutes: FastifyPluginAsyncZod<{ checks: HealthChecks }> = async (app, opts) => {
  // Load balancers probe these every few seconds from a few IPs: never rate-limit them.
  const noRateLimit = { rateLimit: false } as const;

  app.get(
    "/health",
    { config: noRateLimit, schema: { response: { 200: z.object({ status: z.literal("ok") }) } } },
    async () => ({ status: "ok" as const }),
  );

  const CheckResultSchema = z.enum(["ok", "fail"]);
  const ReadySchema = z.object({
    status: z.enum(["ok", "degraded"]),
    checks: z.object({ db: CheckResultSchema, redis: CheckResultSchema }),
  });

  app.get(
    "/health/ready",
    { config: noRateLimit, schema: { response: { 200: ReadySchema, 503: ReadySchema } } },
    async (req, reply) => {
      const [db, redis] = await Promise.all([
        runCheck("db", opts.checks.db, req.log),
        runCheck("redis", opts.checks.redis, req.log),
      ]);
      const ok = db === "ok" && redis === "ok";
      return reply.code(ok ? 200 : 503).send({
        status: ok ? "ok" : "degraded",
        checks: { db, redis },
      });
    },
  );
};
