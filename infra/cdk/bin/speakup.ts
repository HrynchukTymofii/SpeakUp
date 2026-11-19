import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import { readConfig } from "../lib/config.js";
import { SpeakUpStack } from "../lib/speakup-stack.js";

/**
 * CDK entry point (`pnpm --filter @speakup/infra synth|diff|deploy`).
 *
 * Region is fixed to us-east-1 (US-first, next to the bucket and DB). The account comes from
 * your AWS credentials at deploy time; `cdk synth` also works without any credentials.
 */
const app = new cdk.App();
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const config = readConfig(app.node, repoRoot);
// The load-test variant is a different stack name, so it can never update production.
new SpeakUpStack(app, config.loadTest ? "SpeakUp-LoadTest" : "SpeakUp", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: config.loadTest
    ? "SpeakUp LOAD TEST (throwaway): fake STT/LLM, delete after the run"
    : "SpeakUp: API + worker on ECS Fargate, RDS Postgres, ElastiCache Redis, S3",
  config,
});

cdk.Tags.of(app).add("project", "speakup");
