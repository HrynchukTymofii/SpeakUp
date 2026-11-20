import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type DbClient = PrismaClient;

/**
 * Creates the Prisma client for one process (API or worker).
 *
 * A factory instead of a module-level singleton: the caller decides when to connect and
 * passes the client to whatever needs it (easy to swap for a fake in tests, easy to close
 * on shutdown). Call it ONCE per process — each client owns a connection pool.
 *
 * Prisma 7 talks to Postgres through a "driver adapter" (here: node-postgres `pg`)
 * instead of a bundled Rust query engine.
 */
export function createDbClient(databaseUrl: string, opts: { poolMax?: number } = {}): DbClient {
  // `max` = connections in this process's pool. Every task holds its own pool, so scaling out
  // multiplies connections (docs/scaling.md); the env var lets each service take a fair share.
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    ...(opts.poolMax && { max: opts.poolMax }),
  });
  return new PrismaClient({ adapter });
}
