import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Next only auto-loads .env files from its own folder (apps/web). In this monorepo there is a
// single repo-root .env, so load it here — before Next inlines NEXT_PUBLIC_* values into the bundle.
// `pnpm dev`/`build` run with cwd = apps/web. On Vercel, vars come from project settings instead.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
