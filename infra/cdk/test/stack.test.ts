import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { readConfig } from "../lib/config.js";
import { SpeakUpStack } from "../lib/speakup-stack.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function synth(context: Record<string, string> = {}) {
  const app = new cdk.App({
    context: { "speakup:webOrigins": "https://app.speakup.test", ...context },
  });
  const stack = new SpeakUpStack(app, "Test", {
    env: { account: "111111111111", region: "us-east-1" },
    config: readConfig(app.node, repoRoot),
  });
  return { stack, template: Template.fromStack(stack) };
}

/** Container definition of the task definition whose container has this name. */
function container(template: Template, name: string) {
  const defs = template.findResources("AWS::ECS::TaskDefinition");
  for (const def of Object.values(defs)) {
    const found = (def.Properties.ContainerDefinitions as { Name: string }[]).find(
      (c) => c.Name === name,
    );
    if (found)
      return found as unknown as {
        Environment: { Name: string }[];
        Secrets: { Name: string }[];
      };
  }
  throw new Error(`no container ${name}`);
}

describe("SpeakUp stack", () => {
  let template: Template;
  let stack: SpeakUpStack;
  beforeAll(() => {
    ({ stack, template } = synth());
  }, 60_000);

  it("keeps Postgres private, encrypted, TLS-only and protected from deletion", () => {
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      PubliclyAccessible: false,
      StorageEncrypted: true,
      DeletionProtection: true,
    });
    template.hasResource("AWS::RDS::DBInstance", { DeletionPolicy: "Snapshot" });
    template.hasResourceProperties("AWS::RDS::DBParameterGroup", {
      Parameters: { "rds.force_ssl": "1" },
    });
  });

  it("runs Redis with TLS and noeviction (BullMQ must never lose queued jobs)", () => {
    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      TransitEncryptionEnabled: true,
      AtRestEncryptionEnabled: true,
    });
    template.hasResourceProperties("AWS::ElastiCache::ParameterGroup", {
      Properties: { "maxmemory-policy": "noeviction" },
    });
  });

  it("keeps the recordings bucket private, cleans abandoned uploads and allows only the web origins", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: "expire-abandoned-uploads",
            Prefix: "recordings/",
            TagFilters: [{ Key: "upload-status", Value: "pending" }],
            ExpirationInDays: 1,
          }),
        ]),
      },
      CorsConfiguration: {
        CorsRules: [Match.objectLike({ AllowedOrigins: ["https://app.speakup.test"] })],
      },
    });
    template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
  });

  it("makes only media/* of the media bucket public, read-only", () => {
    const policies = Object.values(template.findResources("AWS::S3::BucketPolicy"));
    const publicStatements = policies
      .flatMap(
        (p) =>
          (p as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } })
            .Properties.PolicyDocument.Statement,
      )
      .filter(
        (s) =>
          s.Effect === "Allow" &&
          s.Principal !== undefined &&
          JSON.stringify(s.Principal).includes('"*"'),
      );
    expect(publicStatements).toHaveLength(1);
    expect(publicStatements[0]?.Action).toBe("s3:GetObject");
    expect(JSON.stringify(publicStatements[0]?.Resource)).toContain("/media/*");
    // the recordings bucket still blocks everything public (asserted above); exactly one bucket opens up
    const buckets = Object.values(template.findResources("AWS::S3::Bucket")) as {
      Properties: { PublicAccessBlockConfiguration?: { BlockPublicPolicy?: boolean } };
    }[];
    expect(
      buckets.filter(
        (b) => b.Properties.PublicAccessBlockConfiguration?.BlockPublicPolicy === false,
      ),
    ).toHaveLength(1);
  });

  it("passes API keys as ECS secrets, never as plain environment variables", () => {
    for (const [name, secretKeys] of [
      ["api", ["DB_SECRET", "CLERK_SECRET_KEY", "PADDLE_API_KEY", "IP_HASH_SECRET"]],
      ["worker", ["DB_SECRET", "DEEPGRAM_API_KEY", "ANTHROPIC_API_KEY"]],
      ["migrate", ["DB_SECRET"]],
    ] as const) {
      const c = container(template, name);
      const secrets = c.Secrets.map((s) => s.Name);
      const plain = (c.Environment ?? []).map((e) => e.Name);
      for (const key of secretKeys) {
        expect(secrets).toContain(key);
        expect(plain).not.toContain(key);
      }
      expect(plain.some((k) => /KEY|SECRET|PASSWORD|DATABASE_URL/.test(k))).toBe(false);
    }
  });

  it("configures the API for the ALB: one trusted proxy hop and the production env", () => {
    const env = container(template, "api").Environment;
    expect(env).toContainEqual({ Name: "TRUST_PROXY_HOPS", Value: "1" });
    expect(env).toContainEqual({ Name: "NODE_ENV", Value: "production" });
    expect(env).toContainEqual({ Name: "CORS_ORIGINS", Value: "https://app.speakup.test" });
  });

  it("limits the task roles' S3 access to the recordings/ prefix", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    const s3Statements = Object.values(policies)
      .flatMap(
        (p) => p.Properties.PolicyDocument.Statement as { Action: unknown; Resource: unknown }[],
      )
      .filter((s) => [s.Action].flat().some((a) => String(a).startsWith("s3:")));
    expect(s3Statements.length).toBeGreaterThan(0);
    for (const statement of s3Statements) {
      const resource = JSON.stringify(statement.Resource);
      expect(resource).not.toContain('"*"');
      if ([statement.Action].flat().includes("s3:ListBucket")) continue; // bucket ARN + prefix condition
      expect(resource).toContain("/recordings/*");
    }
  });

  it("gives the worker time to finish in-flight jobs on shutdown", () => {
    const worker = container(template, "worker") as unknown as { StopTimeout: number };
    expect(worker.StopTimeout).toBe(120);
  });

  it("warns when the API has no HTTPS certificate", () => {
    Annotations.fromStack(stack).hasWarning("*", Match.stringLikeRegexp("HTTP-only"));
    template.resourcePropertiesCountIs(
      "AWS::ElasticLoadBalancingV2::Listener",
      { Protocol: "HTTPS" },
      0,
    );
  });

  it("serves HTTPS and redirects HTTP when a certificate is configured", () => {
    const { template: tls } = synth({
      "speakup:certificateArn": "arn:aws:acm:us-east-1:111111111111:certificate/abc",
    });
    tls.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Protocol: "HTTPS",
      Port: 443,
    });
    tls.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Protocol: "HTTP",
      DefaultActions: [Match.objectLike({ Type: "redirect" })],
    });
  }, 60_000);
});

describe("worker autoscaling and connection budget (docs/scaling.md)", () => {
  let template: Template;
  beforeAll(() => {
    template = synth().template;
  }, 60_000);

  const env = (name: string) =>
    Object.fromEntries(
      (
        (container(template, name).Environment ?? []) as unknown as {
          Name: string;
          Value: string;
        }[]
      ).map((e) => [e.Name, e.Value]),
    );

  it("publishes queue depth from the worker, with permission for that namespace only", () => {
    expect(env("worker").QUEUE_METRICS_NAMESPACE).toBe("SpeakUp/Test");
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as { Action: unknown; Condition?: unknown }[],
    );
    const put = statements.find((s) => s.Action === "cloudwatch:PutMetricData");
    expect(put?.Condition).toEqual({
      StringEquals: { "cloudwatch:namespace": "SpeakUp/Test" },
    });
  });

  it("scales the worker 1 → 10 tasks on waiting jobs (not CPU)", () => {
    // (The API's target is 1–4, so MaxCapacity 10 identifies the worker's.)
    template.hasResourceProperties("AWS::ApplicationAutoScaling::ScalableTarget", {
      MinCapacity: 1,
      MaxCapacity: 10,
    });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "SpeakUp/Test",
      MetricName: "QueueWaiting",
    });
  });

  it("sizes DB pools so all tasks at max scale fit a db.t4g.micro (~80 connections)", () => {
    const api = Number(env("api").DB_POOL_MAX);
    const worker = Number(env("worker").DB_POOL_MAX);
    expect(4 * api + 10 * worker).toBeLessThanOrEqual(70); // + headroom for migrations/admin
  });

  it("takes a bigger worker ceiling and DB size from context", () => {
    const big = synth({
      "speakup:workerMaxTasks": "20",
      "speakup:dbInstanceSize": "small",
    }).template;
    big.hasResourceProperties("AWS::ApplicationAutoScaling::ScalableTarget", {
      MaxCapacity: 20,
    });
    big.hasResourceProperties("AWS::RDS::DBInstance", { DBInstanceClass: "db.t4g.small" });
  }, 60_000);

  it("production (cdk.json) runs the load-tested setup: 25 workers on a db.t4g.small", () => {
    const cdkJson = JSON.parse(readFileSync(new URL("../cdk.json", import.meta.url), "utf8")) as {
      context: Record<string, unknown>;
    };
    const prodContext = Object.fromEntries(
      Object.entries(cdkJson.context).filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith("speakup:") && typeof entry[1] === "string",
      ),
    );
    const prod = synth(prodContext).template;
    prod.hasResourceProperties("AWS::ApplicationAutoScaling::ScalableTarget", {
      MaxCapacity: 25,
    });
    prod.hasResourceProperties("AWS::RDS::DBInstance", { DBInstanceClass: "db.t4g.small" });
    // db.t4g.small allows ~190 connections; keep the full-scale total well under it.
    const api = Number(env("api").DB_POOL_MAX);
    const worker = Number(env("worker").DB_POOL_MAX);
    expect(4 * api + 25 * worker).toBeLessThanOrEqual(150);
  }, 60_000);
});

describe("monitoring", () => {
  let template: Template;
  beforeAll(() => {
    ({ template } = synth({ "speakup:alarmEmail": "ops@speakup.test" }));
  }, 60_000);

  type Alarm = {
    AlarmName: string;
    AlarmActions?: unknown[];
    OKActions?: unknown[];
    Threshold?: number;
    TreatMissingData?: string;
    MetricName?: string;
    Namespace?: string;
  };
  const alarms = (t: Template) =>
    Object.values(t.findResources("AWS::CloudWatch::Alarm")).map((a) => a.Properties as Alarm);
  /** Alarms meant for people (the autoscaling ones have generated names and no SNS action). */
  const alerting = (t: Template) => alarms(t).filter((a) => a.AlarmName?.startsWith("Test-"));
  const alarm = (t: Template, suffix: string) => {
    const found = alerting(t).find((a) => a.AlarmName === `Test-${suffix}`);
    if (!found) throw new Error(`no alarm Test-${suffix}`);
    return found;
  };

  it("sends every alerting alarm, and its recovery, to one SNS topic", () => {
    const topics = Object.keys(template.findResources("AWS::SNS::Topic"));
    expect(topics).toHaveLength(1);
    const topicRef = { Ref: topics[0] };
    expect(alerting(template).length).toBeGreaterThanOrEqual(10);
    for (const a of alerting(template)) {
      expect(a.AlarmActions, a.AlarmName).toEqual([topicRef]);
      expect(a.OKActions, a.AlarmName).toEqual([topicRef]);
    }
  });

  it("emails the address from speakup:alarmEmail", () => {
    template.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "email",
      Endpoint: "ops@speakup.test",
    });
  });

  it("covers the API: 5xx from targets and the load balancer, no healthy task, logged errors", () => {
    expect(alarm(template, "api-5xx").MetricName).toBe("HTTPCode_Target_5XX_Count");
    expect(alarm(template, "alb-5xx").MetricName).toBe("HTTPCode_ELB_5XX_Count");
    // No datapoints means no healthy target reported at all: that is an outage, not "fine".
    expect(alarm(template, "api-no-healthy-task").TreatMissingData).toBe("breaching");
    expect(alarm(template, "api-errors").Namespace).toBe("SpeakUp/Test");
  });

  it("counts pino error lines (level ≥ 50) in the API and worker logs as metrics", () => {
    template.resourceCountIs("AWS::Logs::MetricFilter", 2);
    template.hasResourceProperties("AWS::Logs::MetricFilter", {
      FilterPattern: "{ $.level >= 50 }",
      MetricTransformations: [Match.objectLike({ MetricName: "WorkerErrors" })],
    });
    template.hasResourceProperties("AWS::Logs::MetricFilter", {
      FilterPattern: "{ $.level >= 50 }",
      MetricTransformations: [Match.objectLike({ MetricName: "ApiErrors" })],
    });
  });

  it("covers the worker: a backlog that doesn't drain, silent workers, logged errors", () => {
    const backlog = alarm(template, "queue-backlog");
    expect(backlog.MetricName).toBe("QueueWaiting");
    // Workers publish every 30 s; silence means no worker is running.
    expect(backlog.TreatMissingData).toBe("breaching");
    expect(alarm(template, "worker-errors").Namespace).toBe("SpeakUp/Test");
  });

  it("covers Postgres: CPU, free storage, connections near the instance limit", () => {
    expect(alarm(template, "db-cpu").MetricName).toBe("CPUUtilization");
    expect(alarm(template, "db-free-storage").MetricName).toBe("FreeStorageSpace");
    // Default micro: ~80 max connections → alert at 80%.
    expect(alarm(template, "db-connections").Threshold).toBe(64);
  });

  it("covers Redis: memory (noeviction means writes fail when full) and engine CPU", () => {
    expect(alarm(template, "redis-memory").MetricName).toBe("DatabaseMemoryUsagePercentage");
    expect(alarm(template, "redis-cpu").MetricName).toBe("EngineCPUUtilization");
  });

  it("builds one dashboard", () => {
    template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
  });

  it("scales the connections threshold with the DB size", () => {
    const small = synth({ "speakup:dbInstanceSize": "small" }).template;
    expect(alarm(small, "db-connections").Threshold).toBe(152);
  }, 60_000);

  it("creates no subscription without an email, and warns", () => {
    const { stack, template: bare } = synth();
    bare.resourceCountIs("AWS::SNS::Subscription", 0);
    expect(alerting(bare).length).toBeGreaterThan(0);
    Annotations.fromStack(stack).hasWarning("*", Match.stringLikeRegexp("speakup:alarmEmail"));
  }, 60_000);

  it("never emails from the throwaway load-test stack", () => {
    const lt = synth({
      "speakup:loadTest": "true",
      "speakup:alarmEmail": "ops@speakup.test",
    }).template;
    lt.resourceCountIs("AWS::SNS::Subscription", 0);
  }, 60_000);
});

describe("load-test stack (speakup:loadTest=true)", () => {
  let prod: Template;
  let lt: Template;
  beforeAll(() => {
    prod = synth().template;
    lt = synth({ "speakup:loadTest": "true" }).template;
  }, 120_000);

  const env = (t: Template, name: string) =>
    Object.fromEntries(
      ((container(t, name).Environment ?? []) as unknown as { Name: string; Value: string }[]).map(
        (e) => [e.Name, e.Value],
      ),
    );
  const secrets = (t: Template, name: string) => container(t, name).Secrets.map((s) => s.Name);

  it("never sends work to the paid providers and holds no provider keys", () => {
    expect(env(lt, "worker").ANALYSIS_PROVIDERS).toBe("fake");
    expect(secrets(lt, "worker")).not.toContain("DEEPGRAM_API_KEY");
    expect(secrets(lt, "worker")).not.toContain("ANTHROPIC_API_KEY");
  });

  it("turns on load-test auth and lifts the per-IP and daily limits", () => {
    expect(secrets(lt, "api")).toContain("LOAD_TEST_AUTH_SECRET");
    expect(env(lt, "api")).toMatchObject({ LOAD_TEST_STACK: "true" });
    expect(Number(env(lt, "api").RATE_LIMIT_PER_MINUTE)).toBeGreaterThan(100_000);
    expect(Number(env(lt, "api").FREE_DAILY_ANALYSES)).toBeGreaterThan(10_000);
  });

  it("generates its own secrets instead of reading the production ones", () => {
    lt.hasResourceProperties("AWS::SecretsManager::Secret", { Name: "speakup-loadtest/app" });
    lt.hasResourceProperties("AWS::SecretsManager::Secret", { Name: "speakup-loadtest/db" });
    expect(JSON.stringify(lt.toJSON())).not.toContain("speakup/app");
  });

  it("can be deleted completely (no protection, no retained data)", () => {
    lt.hasResourceProperties("AWS::RDS::DBInstance", { DeletionProtection: false });
    lt.hasResource("AWS::RDS::DBInstance", { DeletionPolicy: "Delete" });
    for (const bucket of Object.values(lt.findResources("AWS::S3::Bucket"))) {
      expect(bucket.DeletionPolicy).toBe("Delete");
    }
  });

  it("serves plain HTTP on the load balancer, ignoring the production certificate", () => {
    const withCert = synth({
      "speakup:loadTest": "true",
      "speakup:certificateArn": "arn:aws:acm:us-east-1:111111111111:certificate/abc",
    }).template;
    withCert.resourcePropertiesCountIs(
      "AWS::ElasticLoadBalancingV2::Listener",
      { Protocol: "HTTPS" },
      0,
    );
  }, 60_000);

  it("leaves the production stack untouched by any load-test setting", () => {
    expect(env(prod, "worker").ANALYSIS_PROVIDERS).toBeUndefined();
    expect(env(prod, "api").LOAD_TEST_STACK).toBeUndefined();
    expect(secrets(prod, "api")).not.toContain("LOAD_TEST_AUTH_SECRET");
    expect(secrets(prod, "worker")).toContain("ANTHROPIC_API_KEY");
  });
});

describe("config", () => {
  it("rejects a non-numeric worker ceiling and an unknown DB size", () => {
    const bad = (ctx: Record<string, string>) =>
      new cdk.App({ context: { "speakup:webOrigins": "https://a.test", ...ctx } }).node;
    expect(() => readConfig(bad({ "speakup:workerMaxTasks": "lots" }), repoRoot)).toThrow(
      /workerMaxTasks/,
    );
    expect(() => readConfig(bad({ "speakup:dbInstanceSize": "huge" }), repoRoot)).toThrow(
      /dbInstanceSize/,
    );
  });

  it("rejects an alarm email that isn't an address", () => {
    const app = new cdk.App({
      context: { "speakup:webOrigins": "https://a.test", "speakup:alarmEmail": "ops" },
    });
    expect(() => readConfig(app.node, repoRoot)).toThrow(/alarmEmail/);
  });

  it("rejects a web origin with a path", () => {
    const app = new cdk.App({ context: { "speakup:webOrigins": "https://speakup.app/start" } });
    expect(() => readConfig(app.node, repoRoot)).toThrow(/must be an origin/);
  });
});
