import type { Node } from "constructs";

/**
 * Deploy-time settings. They live in cdk.json → "context" (edit them there) and can be
 * overridden per command: `pnpm cdk synth -c speakup:webOrigins=https://speakup.app`.
 * Secrets never go here: they live in Secrets Manager (see app-secrets.example.json).
 */
export interface SpeakUpConfig {
  /** Absolute path of the monorepo root (the Docker build context). */
  repoRoot: string;
  /** Web app origins: CORS on the API and on the recordings bucket, and Clerk's authorized parties. */
  webOrigins: string[];
  /** ACM certificate for the API's domain (same region as the stack). Empty = HTTP only. */
  certificateArn?: string;
  paddleEnv: "sandbox" | "production";
  /** Name of the Secrets Manager secret that holds the app's API keys (created by hand, once). */
  appSecretName: string;
  anthropicModel: string;
  /**
   * `-c speakup:loadTest=true`: a separate, throwaway `SpeakUp-LoadTest` stack for load tests
   * (docs/load-testing.md). Simulated Deepgram/Claude, its own generated secrets, load-test
   * auth on, nothing retained on delete. Never set it for the production stack.
   */
  loadTest: boolean;
}

export function readConfig(node: Node, repoRoot: string): SpeakUpConfig {
  const get = (key: string): string => {
    const value: unknown = node.tryGetContext(`speakup:${key}`);
    return typeof value === "string" ? value.trim() : "";
  };

  const webOrigins = get("webOrigins")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of webOrigins) {
    if (!/^https?:\/\/[^/]+$/.test(origin)) {
      throw new Error(`speakup:webOrigins: "${origin}" must be an origin like https://speakup.app`);
    }
  }
  if (webOrigins.length === 0) throw new Error("speakup:webOrigins is required");

  const paddleEnv = get("paddleEnv") || "sandbox";
  if (paddleEnv !== "sandbox" && paddleEnv !== "production") {
    throw new Error('speakup:paddleEnv must be "sandbox" or "production"');
  }

  return {
    repoRoot,
    webOrigins,
    certificateArn: get("certificateArn") || undefined,
    paddleEnv,
    appSecretName: get("appSecretName") || "speakup/app",
    anthropicModel: get("anthropicModel") || "claude-sonnet-5-5",
    loadTest: get("loadTest") === "true",
  };
}
