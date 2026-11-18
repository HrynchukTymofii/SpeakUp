import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env files. In dev we load the single repo-root .env
// (same convention as the apps). In CI/prod, DATABASE_URL comes from the environment.
const rootEnv = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Run by `prisma db seed` and after `prisma migrate reset`.
    seed: "tsx prisma/seed.ts",
  },
  // Only needed by commands that talk to the DB (migrate, seed, studio).
  // `prisma generate` works without it, which keeps CI typecheck DB-free.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
