import { defineConfig } from "vitest/config";

export default defineConfig({
  // cdk.out holds staged copies of the whole repo (Docker build context): never test those.
  test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 },
});
