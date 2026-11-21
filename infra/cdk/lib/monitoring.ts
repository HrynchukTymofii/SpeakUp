import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import type * as ecs from "aws-cdk-lib/aws-ecs";
import type * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import type * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import type { SpeakUpConfig } from "./config.js";

export interface MonitoringProps {
  config: SpeakUpConfig;
  /** Custom metric namespace the worker already publishes queue depth to. */
  namespace: string;
  api: ecsPatterns.ApplicationLoadBalancedFargateService;
  apiLogs: logs.ILogGroup;
  worker: ecs.FargateService;
  workerLogs: logs.ILogGroup;
  queueWaiting: cloudwatch.Metric;
  db: rds.DatabaseInstance;
  redis: elasticache.CfnReplicationGroup;
}

/**
 * Approximate max_connections per RDS size (Postgres default: memory / ~9.5 MB, minus what
 * RDS reserves). docs/scaling.md §3 explains why connections run out before CPU does.
 */
const DB_MAX_CONNECTIONS: Record<SpeakUpConfig["dbInstanceSize"], number> = {
  micro: 80,
  small: 190,
  medium: 410,
  large: 840,
};

/**
 * Tells a person when production is broken, and shows what's happening on one dashboard.
 *
 * Every alarm here answers "would I want to be woken for this?": users get errors, nobody gets
 * feedback, or a resource is about to run out. Each one notifies the SNS topic when it fires
 * and again when it recovers. The thresholds come from the load tests (docs/load-testing.md):
 * normal traffic never crosses them. What to do when one fires is in docs/runbook.md "Alarms".
 */
export class Monitoring extends Construct {
  readonly topic: sns.Topic;
  readonly alarms: cloudwatch.Alarm[] = [];

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);
    const { config, namespace, api, worker, db, redis } = props;
    const stackName = cdk.Stack.of(this).stackName;

    this.topic = new sns.Topic(this, "AlarmTopic", { displayName: `${stackName} alarms` });
    // Load tests push every metric past its threshold on purpose: never email about them.
    if (config.alarmEmail && !config.loadTest) {
      this.topic.addSubscription(new subscriptions.EmailSubscription(config.alarmEmail));
    } else if (!config.loadTest) {
      cdk.Annotations.of(this).addWarningV2(
        "speakup:no-alarm-email",
        "No speakup:alarmEmail set: alarms exist but notify nobody. Set it in cdk.json.",
      );
    }

    const alarm = (
      name: string,
      description: string,
      metric: cloudwatch.Metric,
      options: Omit<cloudwatch.CreateAlarmOptions, "alarmName" | "alarmDescription">,
    ) => {
      const created = metric.createAlarm(this, name, {
        alarmName: `${stackName}-${name}`,
        alarmDescription: `${description} Runbook: docs/runbook.md "Alarms".`,
        ...options,
      });
      created.addAlarmAction(new cwActions.SnsAction(this.topic));
      created.addOkAction(new cwActions.SnsAction(this.topic));
      this.alarms.push(created);
      return created;
    };
    const { GREATER_THAN_OR_EQUAL_TO_THRESHOLD: atLeast, LESS_THAN_THRESHOLD: below } =
      cloudwatch.ComparisonOperator;
    const fiveMin = cdk.Duration.minutes(5);
    const oneMin = cdk.Duration.minutes(1);

    // ── Error lines in the logs → metrics ───────────────────────────────────────────────
    // Both services log JSON with pino, where level 50 = error and 60 = fatal. A failed job,
    // an unhandled API exception and a failed cleanup all land here.
    const errorCount = (logGroup: logs.ILogGroup, metricName: string) => {
      new logs.MetricFilter(this, `${metricName}Filter`, {
        logGroup,
        filterPattern: logs.FilterPattern.literal("{ $.level >= 50 }"),
        metricNamespace: namespace,
        metricName,
        metricValue: "1",
      });
      return new cloudwatch.Metric({
        namespace,
        metricName,
        statistic: "Sum",
        period: fiveMin,
      });
    };
    const apiErrors = errorCount(props.apiLogs, "ApiErrors");
    const workerErrors = errorCount(props.workerLogs, "WorkerErrors");

    // ── API ─────────────────────────────────────────────────────────────────────────────
    const lb = api.loadBalancer.metrics;
    const target5xx = lb.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
      period: fiveMin,
      statistic: "Sum",
    });
    const elb5xx = lb.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT, {
      period: fiveMin,
      statistic: "Sum",
    });
    const healthyTasks = api.targetGroup.metrics.healthyHostCount({
      period: oneMin,
      statistic: "Minimum",
    });
    alarm("api-5xx", "The API answered 10+ requests with a 5xx in 5 minutes.", target5xx, {
      threshold: 10,
      comparisonOperator: atLeast,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    // 502/503/504 made by the load balancer itself: no task to send to, or tasks timing out.
    alarm("alb-5xx", "The load balancer returned 10+ 5xx in 5 minutes.", elb5xx, {
      threshold: 10,
      comparisonOperator: atLeast,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm(
      "api-no-healthy-task",
      "No API task passed its health check for 3 minutes.",
      healthyTasks,
      {
        threshold: 1,
        comparisonOperator: below,
        evaluationPeriods: 3,
        // The metric disappears when the target group has no targets at all: that's down too.
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      },
    );
    alarm("api-errors", "The API logged 5+ errors in 5 minutes.", apiErrors, {
      threshold: 5,
      comparisonOperator: atLeast,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ── Worker ──────────────────────────────────────────────────────────────────────────
    // Autoscaling drained 1,000 users' recordings in ~8 min, so a backlog still there after
    // 10 min means workers are stuck or capped. Workers publish every 30 s, so a missing
    // datapoint means no worker is running at all: also an alarm.
    alarm(
      "queue-backlog",
      "100+ recordings have waited for 10 minutes, or no worker is reporting.",
      props.queueWaiting,
      {
        threshold: 100,
        comparisonOperator: atLeast,
        evaluationPeriods: 10,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      },
    );
    alarm("worker-errors", "The worker logged 5+ errors in 5 minutes.", workerErrors, {
      threshold: 5,
      comparisonOperator: atLeast,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ── Postgres ────────────────────────────────────────────────────────────────────────
    const maxConnections = DB_MAX_CONNECTIONS[config.dbInstanceSize];
    const dbCpu = db.metricCPUUtilization({ period: fiveMin });
    const dbConnections = db.metricDatabaseConnections({ period: fiveMin, statistic: "Maximum" });
    const dbFreeStorage = db.metricFreeStorageSpace({ period: fiveMin, statistic: "Minimum" });
    alarm("db-cpu", "Postgres CPU stayed above 80% for 15 minutes.", dbCpu, {
      threshold: 80,
      comparisonOperator: atLeast,
      evaluationPeriods: 3,
    });
    alarm(
      "db-connections",
      `Postgres reached 80% of its ~${maxConnections} connections.`,
      dbConnections,
      {
        threshold: Math.round(maxConnections * 0.8),
        comparisonOperator: atLeast,
        evaluationPeriods: 2,
      },
    );
    // Storage autoscales up to 100 GB; this fires when that isn't keeping up or hit the cap.
    alarm("db-free-storage", "Postgres has under 2 GB of free storage.", dbFreeStorage, {
      threshold: 2 * 1024 ** 3,
      comparisonOperator: below,
      evaluationPeriods: 1,
    });

    // ── Redis ───────────────────────────────────────────────────────────────────────────
    // One node (numCacheClusters: 1), whose id is the replication group's id + "-001".
    const redisMetric = (metricName: string) =>
      new cloudwatch.Metric({
        namespace: "AWS/ElastiCache",
        metricName,
        dimensionsMap: { CacheClusterId: `${redis.ref}-001` },
        statistic: "Maximum",
        period: fiveMin,
      });
    const redisMemory = redisMetric("DatabaseMemoryUsagePercentage");
    const redisCpu = redisMetric("EngineCPUUtilization");
    // maxmemory-policy is noeviction: when memory is full, new jobs fail instead of queueing.
    alarm("redis-memory", "Redis memory is above 80% (at 100% new jobs fail).", redisMemory, {
      threshold: 80,
      comparisonOperator: atLeast,
      evaluationPeriods: 2,
    });
    alarm("redis-cpu", "Redis engine CPU stayed above 80% for 15 minutes.", redisCpu, {
      threshold: 80,
      comparisonOperator: atLeast,
      evaluationPeriods: 3,
    });

    // ── Dashboard ───────────────────────────────────────────────────────────────────────
    const graph = (
      title: string,
      left: cloudwatch.IMetric[],
      extra: Partial<cloudwatch.GraphWidgetProps> = {},
    ) => new cloudwatch.GraphWidget({ title, left, width: 8, height: 6, ...extra });

    new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: stackName,
      defaultInterval: cdk.Duration.hours(3),
      widgets: [
        [new cloudwatch.AlarmStatusWidget({ title: "Alarms", alarms: this.alarms, width: 24 })],
        [
          graph("API requests and 5xx (per 5 min)", [
            lb.requestCount({ period: fiveMin, statistic: "Sum" }),
            target5xx,
            elb5xx,
          ]),
          // Long-polling holds result requests open on purpose, so p95 includes those waits.
          graph("API response time (p50, p95)", [
            lb.targetResponseTime({ period: fiveMin, statistic: "p50" }),
            lb.targetResponseTime({ period: fiveMin, statistic: "p95" }),
          ]),
          graph("API tasks: CPU % and healthy count", [api.service.metricCpuUtilization()], {
            right: [healthyTasks],
          }),
        ],
        [
          graph("Queue: waiting and in progress", [
            props.queueWaiting,
            new cloudwatch.Metric({
              namespace,
              metricName: "QueueActive",
              statistic: "Maximum",
              period: oneMin,
            }),
          ]),
          graph("Worker CPU %", [worker.metricCpuUtilization()]),
          graph("Logged errors (per 5 min)", [apiErrors, workerErrors]),
        ],
        [
          graph("Postgres CPU %", [dbCpu]),
          graph("Postgres connections", [dbConnections], {
            leftAnnotations: [{ value: maxConnections, label: "approx. limit" }],
          }),
          graph("Postgres free storage (bytes)", [dbFreeStorage]),
        ],
        [graph("Redis memory %", [redisMemory]), graph("Redis engine CPU %", [redisCpu])],
      ],
    });

    new cdk.CfnOutput(cdk.Stack.of(this), "DashboardUrl", {
      value: `https://${cdk.Aws.REGION}.console.aws.amazon.com/cloudwatch/home#dashboards/dashboard/${stackName}`,
    });
  }
}
