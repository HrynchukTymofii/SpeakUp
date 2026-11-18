import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Web tests. Logic tests (`*.test.ts`) run in plain Node. Component tests (`*.test.tsx`) opt into
 * a simulated browser with a `// @vitest-environment jsdom` comment at the top of the file, so
 * the fast Node tests don't pay for jsdom.
 */
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json ("@/components/…").
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
