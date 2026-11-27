import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as appscaling from "aws-cdk-lib/aws-applicationautoscaling";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { SpeakUpConfig } from "./config.js";
import { ApiFirewall } from "./firewall.js";
import { Monitoring } from "./monitoring.js";

export interface SpeakUpStackProps extends cdk.StackProps {
  config: SpeakUpConfig;
}

/** Prefix under which every recording lives (apps/api/src/services/storage.ts). */
const RECORDINGS_PREFIX = "recordings/";
const API_PORT = 4000;

/**
 * Postgres connections per process. Every task holds its own pool, so the sum at maximum scale
 * must stay under the DB's max_connections. Production (cdk.json): 4 API × 8 + 25 workers × 3
 * = 107 of ~190 on db.t4g.small. The defaults (10 workers, micro) give 62 of ~80. A worker job
 * uses the DB in short, sequential steps, so 3 connections serve its 4 jobs.
 */
const API_DB_POOL = 8;
const WORKER_DB_POOL = 3;

/**
 * Everything SpeakUp needs on AWS, in one stack (SPEC §3, M8):
 *
 *   Internet → ALB (public subnets) → API tasks ─┐
 *                                    Worker tasks ┼→ RDS Postgres, ElastiCache Redis (isolated subnets)
 *                                                 └→ S3 recordings bucket (via a VPC endpoint)
 *
 * The web app is not here: it runs on Vercel and calls the API over HTTPS.
 */
export class SpeakUpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SpeakUpStackProps) {
    super(scope, id, props);
    const { config } = props;
    const { loadTest } = config;
    // The throwaway load-test stack must delete cleanly; production keeps its data.
    const disposable = loadTest ? cdk.RemovalPolicy.DESTROY : undefined;
    const dbSecretName = loadTest ? "speakup-loadtest/db" : "speakup/db";

    // ── Network ────────────────────────────────────────────────────────────────────────
    // Three subnet tiers in 2 AZs: public (load balancer, NAT), app (containers: outbound
    // internet via NAT for Clerk/Deepgram/Claude/Paddle, no inbound from the internet), and
    // data (databases: no internet at all). One NAT gateway keeps cost down; with one NAT,
    // losing its AZ cuts outbound traffic until AWS recovers it (2 NATs = HA, double cost).
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "app", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      // S3 traffic (audio up/downloads by the worker) goes over this free endpoint instead
      // of the NAT gateway, which charges per GB.
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });
    const appSubnets: ec2.SubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };
    const dataSubnets: ec2.SubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };

    // ── Postgres (RDS) ─────────────────────────────────────────────────────────────────
    // RDS generates the master password and keeps it in Secrets Manager; containers get the
    // secret's JSON as DB_SECRET and build DATABASE_URL (infra/docker/entrypoint.sh).
    const db = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        {
          micro: ec2.InstanceSize.MICRO,
          small: ec2.InstanceSize.SMALL,
          medium: ec2.InstanceSize.MEDIUM,
          large: ec2.InstanceSize.LARGE,
        }[config.dbInstanceSize],
      ),
      vpc,
      vpcSubnets: dataSubnets,
      credentials: rds.Credentials.fromGeneratedSecret("speakup", { secretName: dbSecretName }),
      databaseName: "speakup",
      allocatedStorage: 20,
      maxAllocatedStorage: 100, // storage autoscaling
      storageEncrypted: true,
      multiAz: false, // turn on for production HA (standby in a 2nd AZ, ~2× cost)
      backupRetention: cdk.Duration.days(loadTest ? 0 : 7),
      // Refuse unencrypted connections; apps connect with sslmode=verify-full.
      parameters: { "rds.force_ssl": "1" },
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      // User data: no accidental `cdk destroy`; if the stack is deleted, keep a final snapshot.
      deletionProtection: !loadTest,
      removalPolicy: disposable ?? cdk.RemovalPolicy.SNAPSHOT,
    });
    const dbSecret = db.secret;
    if (!dbSecret) throw new Error("RDS did not create a credentials secret");

    // ── Redis (ElastiCache) ────────────────────────────────────────────────────────────
    // BullMQ queue + rate-limit counters. noeviction: if Redis fills up it must return
    // errors, never silently drop queued jobs (the default policy evicts keys).
    const redisSg = new ec2.SecurityGroup(this, "RedisSg", {
      vpc,
      description: "ElastiCache Redis: only reachable from SpeakUp containers",
      allowAllOutbound: false,
    });
    const redisSubnets = new elasticache.CfnSubnetGroup(this, "RedisSubnets", {
      description: "SpeakUp Redis (isolated subnets)",
      subnetIds: vpc.selectSubnets(dataSubnets).subnetIds,
    });
    const redisParams = new elasticache.CfnParameterGroup(this, "RedisParams", {
      cacheParameterGroupFamily: "redis7",
      description: "SpeakUp: BullMQ needs noeviction",
      properties: { "maxmemory-policy": "noeviction" },
    });
    const redis = new elasticache.CfnReplicationGroup(this, "Redis", {
      replicationGroupDescription: "SpeakUp queue and rate limits",
      engine: "redis",
      engineVersion: "7.1",
      cacheNodeType: "cache.t4g.micro",
      numCacheClusters: 1, // 2 = a replica in another AZ + automatic failover
      automaticFailoverEnabled: false,
      cacheSubnetGroupName: redisSubnets.ref,
      cacheParameterGroupName: redisParams.ref,
      securityGroupIds: [redisSg.securityGroupId],
      transitEncryptionEnabled: true, // TLS → the URL scheme is rediss://
      atRestEncryptionEnabled: true,
      snapshotRetentionLimit: 1,
    });
    const redisUrl = `rediss://${redis.attrPrimaryEndPointAddress}:${redis.attrPrimaryEndPointPort}`;
    const redisAccess = new ec2.Connections({
      securityGroups: [redisSg],
      defaultPort: ec2.Port.tcp(6379),
    });

    // ── S3: recordings ─────────────────────────────────────────────────────────────────
    // Private; browsers upload with pre-signed POSTs. Same settings as the dev bucket in
    // README "Recordings storage".
    const bucket = new s3.Bucket(this, "Recordings", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: config.webOrigins,
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          // Uploaded but never submitted → deleted after a day (the API removes the tag on submit).
          id: "expire-abandoned-uploads",
          prefix: RECORDINGS_PREFIX,
          tagFilters: { "upload-status": "pending" },
          expiration: cdk.Duration.days(1),
        },
        {
          id: "abort-incomplete-multipart",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: disposable ?? cdk.RemovalPolicy.RETAIN, // user recordings outlive the stack
      autoDeleteObjects: loadTest,
    });

    // ── S3: public media ───────────────────────────────────────────────────────────────
    // Marketing assets anyone may watch (funnel / lesson videos), uploaded by hand. Kept apart
    // from the recordings bucket so that one can never be made public by mistake. Only objects
    // under media/ are readable; nothing can list the bucket.
    const media = new s3.Bucket(this, "Media", {
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: disposable ?? cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: loadTest,
    });
    media.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        principals: [new iam.AnyPrincipal()],
        resources: [media.arnForObjects("media/*")],
      }),
    );

    // ── App secrets ────────────────────────────────────────────────────────────────────
    // Created once by hand (README "Deploy"), so no API key ever appears in CloudFormation
    // templates or in git. ECS injects each JSON field as an env var when a task starts.
    // The load-test stack never reads the production keys: it generates its own secret with
    // dummy values (nothing calls Clerk/Paddle/Turnstile there) plus a random
    // LOAD_TEST_AUTH_SECRET that k6 reads after deploy (docs/load-testing.md).
    const appSecret: secretsmanager.ISecret = loadTest
      ? new secretsmanager.Secret(this, "LoadTestAppSecret", {
          secretName: "speakup-loadtest/app",
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          generateSecretString: {
            secretStringTemplate: JSON.stringify({
              CLERK_SECRET_KEY: "sk_test_loadtest_unused",
              PADDLE_API_KEY: "loadtest-unused",
              PADDLE_WEBHOOK_SECRET: "loadtest-unused",
              PADDLE_PRICE_ID_PRO_MONTHLY: "pri_loadtest_unused",
              TURNSTILE_SECRET_KEY: "loadtest-unused",
              IP_HASH_SECRET: "loadtest-unused-ip-hash-secret",
            }),
            generateStringKey: "LOAD_TEST_AUTH_SECRET",
            passwordLength: 48,
            excludePunctuation: true,
          },
        })
      : secretsmanager.Secret.fromSecretNameV2(this, "AppSecret", config.appSecretName);
    const fromAppSecret = (key: string) => ecs.Secret.fromSecretsManager(appSecret, key);

    // ── ECS cluster + images ───────────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    // Built from ../../Dockerfile on the machine running `cdk deploy` and pushed to the CDK
    // bootstrap ECR repo. x86_64, so builds on a normal laptop/CI need no CPU emulation.
    const image = (target: "runtime" | "migrate", app: "api" | "worker" | "db") =>
      ecs.ContainerImage.fromAsset(config.repoRoot, {
        file: "Dockerfile",
        target,
        buildArgs: { APP: app },
        platform: Platform.LINUX_AMD64,
      });
    const runtimePlatform: ecs.RuntimePlatform = {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    };
    const logGroups = new Map<string, logs.LogGroup>();
    const logDriver = (name: string) => {
      const logGroup = new logs.LogGroup(this, `${name}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH, // logs hold user ids/IPs: don't keep forever
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      logGroups.set(name, logGroup); // the alarms count error lines in these
      return ecs.LogDrivers.awsLogs({ streamPrefix: name, logGroup });
    };
    const sharedEnv = {
      NODE_ENV: "production",
      AWS_REGION: this.region,
      S3_BUCKET: bucket.bucketName,
      REDIS_URL: redisUrl,
      // Error reports (Sentry). Not from load tests: they fail jobs on purpose.
      ...(config.sentryDsn && !loadTest && { SENTRY_DSN: config.sentryDsn }),
    };
    const dbSecretEnv = { DB_SECRET: ecs.Secret.fromSecretsManager(dbSecret) };

    // ── API: Fargate behind a public Application Load Balancer ─────────────────────────
    // The load-test stack is reached by its raw ALB hostname, which the production
    // certificate doesn't cover: plain HTTP there (k6 sends no secrets worth protecting).
    const certificate =
      config.certificateArn && !loadTest
        ? acm.Certificate.fromCertificateArn(this, "ApiCertificate", config.certificateArn)
        : undefined;
    if (!certificate) {
      cdk.Annotations.of(this).addWarningV2(
        "speakup:no-https",
        "No speakup:certificateArn set: the API is HTTP-only. Browsers block an https web app " +
          "from calling it (mixed content). Set a certificate before going live.",
      );
    }

    const api = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Api", {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      runtimePlatform,
      taskSubnets: appSubnets,
      publicLoadBalancer: true,
      // A deploy whose new tasks keep failing health checks is rolled back automatically.
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100, // start new tasks before stopping old ones: no downtime
      ...(certificate && {
        certificate,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        redirectHTTP: true,
        sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      }),
      taskImageOptions: {
        containerName: "api",
        image: image("runtime", "api"),
        containerPort: API_PORT,
        logDriver: logDriver("Api"),
        environment: {
          ...sharedEnv,
          API_PORT: String(API_PORT),
          CORS_ORIGINS: config.webOrigins.join(","),
          PADDLE_ENV: config.paddleEnv,
          TRUST_PROXY_HOPS: "1", // the ALB
          DB_POOL_MAX: String(API_DB_POOL),
          ...(loadTest && {
            LOAD_TEST_STACK: "true",
            // k6 runs from a few IPs and each virtual user records many times: the per-IP
            // limit and the daily quota would measure themselves, not the system.
            RATE_LIMIT_PER_MINUTE: "1000000",
            FREE_DAILY_ANALYSES: "100000",
          }),
        },
        secrets: {
          ...dbSecretEnv,
          ...(loadTest && { LOAD_TEST_AUTH_SECRET: fromAppSecret("LOAD_TEST_AUTH_SECRET") }),
          CLERK_SECRET_KEY: fromAppSecret("CLERK_SECRET_KEY"),
          PADDLE_API_KEY: fromAppSecret("PADDLE_API_KEY"),
          PADDLE_WEBHOOK_SECRET: fromAppSecret("PADDLE_WEBHOOK_SECRET"),
          PADDLE_PRICE_ID_PRO_MONTHLY: fromAppSecret("PADDLE_PRICE_ID_PRO_MONTHLY"),
          TURNSTILE_SECRET_KEY: fromAppSecret("TURNSTILE_SECRET_KEY"),
          IP_HASH_SECRET: fromAppSecret("IP_HASH_SECRET"),
        },
      },
    });
    // Liveness only: /health/ready also pings Postgres + Redis, and a short DB blip must not
    // make the ALB kill every API task at once.
    api.targetGroup.configureHealthCheck({
      path: "/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(15),
      healthyThresholdCount: 2,
    });
    // Give in-flight requests 30 s to finish when a task is replaced (default 300 s).
    api.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "30");
    const apiCpuTarget = 60;
    const apiScaling = api.service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 });
    apiScaling.scaleOnCpuUtilization("CpuScaling", { targetUtilizationPercent: apiCpuTarget });

    // Flood / DDoS protection for the API (lib/firewall.ts). Not on the load-test stack: k6
    // sends everything from a few IPs and would trip the per-IP rule on purpose.
    const firewall = loadTest
      ? undefined
      : new ApiFirewall(this, "ApiFirewall", { loadBalancer: api.loadBalancer });

    // ── Worker: Fargate service, no load balancer (it only pulls jobs from Redis) ──────
    // Workers publish the queue depth here; the autoscaling and monitoring alarms read it.
    const queueMetricsNamespace = `SpeakUp/${this.stackName}`;
    const workerTask = new ecs.FargateTaskDefinition(this, "WorkerTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform,
    });
    workerTask.addContainer("worker", {
      image: image("runtime", "worker"),
      logging: logDriver("Worker"),
      environment: {
        ...sharedEnv,
        WORKER_CONCURRENCY: "4",
        DB_POOL_MAX: String(WORKER_DB_POOL),
        QUEUE_METRICS_NAMESPACE: queueMetricsNamespace,
        ANTHROPIC_MODEL: config.anthropicModel,
        // Load tests: simulated Deepgram/Claude, no network calls, no provider cost.
        ...(loadTest && { ANALYSIS_PROVIDERS: "fake" }),
        PRICE_STT_USD_PER_MIN: "0.0043",
        PRICE_LLM_INPUT_USD_PER_MTOK: "2",
        PRICE_LLM_OUTPUT_USD_PER_MTOK: "10",
      },
      secrets: {
        ...dbSecretEnv,
        ...(!loadTest && {
          DEEPGRAM_API_KEY: fromAppSecret("DEEPGRAM_API_KEY"),
          ANTHROPIC_API_KEY: fromAppSecret("ANTHROPIC_API_KEY"),
        }),
      },
      // After SIGTERM the worker finishes in-flight analyses (STT + LLM can take ~1 min)
      // before ECS force-kills it. 120 s is the Fargate maximum.
      stopTimeout: cdk.Duration.seconds(120),
    });
    const worker = new ecs.FargateService(this, "Worker", {
      cluster,
      taskDefinition: workerTask,
      desiredCount: 1,
      vpcSubnets: appSubnets,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
    });

    // Scale on waiting jobs, not CPU: a job mostly waits on the STT/LLM APIs, so CPU stays
    // moderate while users wait (load test: docs/load-testing.md). One task clears ~55
    // recordings/min; Fargate needs ~1 min to start one, so add several at once when the
    // backlog is large, and remove one at a time (stopping tasks finish their jobs first).
    const queueWaiting = new cloudwatch.Metric({
      namespace: queueMetricsNamespace,
      metricName: "QueueWaiting",
      statistic: "Maximum",
      period: cdk.Duration.minutes(1),
    });
    const workerTaskCount = worker.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: config.workerMaxTasks,
    });
    workerTaskCount.scaleOnMetric("QueueDepthScaling", {
      metric: queueWaiting,
      adjustmentType: appscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      scalingSteps: [
        { upper: 0, change: -1 },
        { lower: 8, change: +1 },
        { lower: 30, change: +3 },
        { lower: 100, change: +6 },
      ],
      cooldown: cdk.Duration.seconds(60),
      evaluationPeriods: 1,
    });
    // scaleOnMetric returns nothing; monitoring needs the policy's scale-out alarm.
    const workerScaling = workerTaskCount.node
      .findAll()
      .find((c): c is appscaling.StepScalingPolicy => c instanceof appscaling.StepScalingPolicy);
    if (!workerScaling) throw new Error("worker has no step scaling policy");

    // ── Alarms + dashboard (lib/monitoring.ts) ─────────────────────────────────────────
    const logGroup = (name: string) => {
      const group = logGroups.get(name);
      if (!group) throw new Error(`no log group ${name}`);
      return group;
    };
    new Monitoring(this, "Monitoring", {
      config,
      namespace: queueMetricsNamespace,
      api,
      apiLogs: logGroup("Api"),
      apiCpuTarget,
      worker,
      workerLogs: logGroup("Worker"),
      queueWaiting,
      workerScaling,
      firewall,
      db,
      redis,
    });

    // ── Migration task: run on demand (see the MigrateCommand output) ──────────────────
    const migrateTask = new ecs.FargateTaskDefinition(this, "MigrateTask", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform,
    });
    migrateTask.addContainer("migrate", {
      image: image("migrate", "db"),
      logging: logDriver("Migrate"),
      environment: { NODE_ENV: "production" },
      secrets: dbSecretEnv,
    });
    const migrateSg = new ec2.SecurityGroup(this, "MigrateSg", {
      vpc,
      description: "One-off migration/seed tasks",
    });

    // ── Who may talk to whom (security groups) ─────────────────────────────────────────
    for (const [peer, label] of [
      [api.service, "API"],
      [worker, "worker"],
      [migrateSg, "migrations"],
    ] as const) {
      db.connections.allowDefaultPortFrom(peer, `Postgres from ${label}`);
    }
    redisAccess.allowDefaultPortFrom(api.service, "Redis from API");
    redisAccess.allowDefaultPortFrom(worker, "Redis from worker");

    // ── IAM task roles: least privilege on the recordings prefix only ──────────────────
    // (The *execution* role, which pulls images and reads the secrets above, is separate
    // and gets its permissions from CDK automatically.)
    const recordingObjects = bucket.arnForObjects(`${RECORDINGS_PREFIX}*`);
    // ListBucket makes a missing object a 404 instead of a 403 (README "Recordings storage").
    const listRecordings = new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { "s3:prefix": [`${RECORDINGS_PREFIX}*`] } },
    });
    // API: signs uploads (Put + tagging), checks them (HeadObject = GetObject), untags on submit.
    api.taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:PutObjectTagging",
          "s3:GetObjectTagging",
          "s3:DeleteObjectTagging",
        ],
        resources: [recordingObjects],
      }),
    );
    api.taskDefinition.addToTaskRolePolicy(listRecordings);
    // Worker: download links for Deepgram (GetObject), funnel cleanup (DeleteObject).
    workerTask.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:DeleteObject"],
        resources: [recordingObjects],
      }),
    );
    workerTask.addToTaskRolePolicy(listRecordings);
    // Worker: queue-depth metrics for its own autoscaling, in its own namespace only.
    workerTask.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"], // PutMetricData has no resource ARNs; the condition scopes it
        conditions: { StringEquals: { "cloudwatch:namespace": queueMetricsNamespace } },
      }),
    );

    // ── Outputs (printed after `cdk deploy`) ───────────────────────────────────────────
    const scheme = certificate ? "https" : "http";
    new cdk.CfnOutput(this, "ApiLoadBalancerUrl", {
      value: `${scheme}://${api.loadBalancer.loadBalancerDnsName}`,
      description: "Point your API domain (CNAME) here; NEXT_PUBLIC_API_URL uses that domain",
    });
    new cdk.CfnOutput(this, "RecordingsBucket", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "MediaBaseUrl", {
      value: `https://${media.bucketRegionalDomainName}/media/`,
      description:
        "Public files: upload to s3://<MediaBucket>/media/<name>, link = this URL + <name>",
    });
    new cdk.CfnOutput(this, "MediaBucket", { value: media.bucketName });
    new cdk.CfnOutput(this, "DbSecretName", { value: dbSecretName });
    if (loadTest) {
      new cdk.CfnOutput(this, "LoadTestSecretName", {
        value: "speakup-loadtest/app",
        description: "k6 reads LOAD_TEST_AUTH_SECRET from here (docs/load-testing.md)",
      });
    }
    const subnets = vpc.selectSubnets(appSubnets).subnetIds.join(",");
    new cdk.CfnOutput(this, "MigrateCommand", {
      description: "Applies Prisma migrations as a one-off Fargate task",
      value:
        `aws ecs run-task --region ${this.region} --cluster ${cluster.clusterName} ` +
        `--task-definition ${migrateTask.taskDefinitionArn} --launch-type FARGATE ` +
        `--network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${migrateSg.securityGroupId}]}"`,
    });
  }
}
