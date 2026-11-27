/**
 * Test doubles for route tests. Excluded from the production build (tsconfig.build.json).
 *
 * FakeDb implements only the handful of Prisma calls our routes make, backed by arrays.
 * This keeps route tests fast and DB-free; the real queries are exercised end-to-end in dev.
 */
import type { Attempt, DbClient, Subscription, User } from "@speakup/db";
import type { PresignedUpload } from "@speakup/shared";
import type { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv, type Env } from "../env.js";
import { buildServer } from "../server.js";
import type { AnalysisQueue } from "../services/analysis-queue.js";
import { createInMemoryKeyedLock } from "../services/user-lock.js";
import type { AuthProvider } from "../services/auth-provider.js";
import { createAttemptEventHub, type AttemptEventHub } from "../services/attempt-events.js";
import type { BotCheck } from "../services/bot-check.js";
import {
  WebhookSignatureError,
  type NormalizedEvent,
  type PaymentProvider,
} from "../services/payments/types.js";
import type { RateLimiter } from "../services/rate-limiter.js";
import type { Storage } from "../services/storage.js";

export const testEnv: Env = parseEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGINS: "http://localhost:3000",
  CLERK_SECRET_KEY: "sk_test_fake",
  S3_BUCKET: "test-bucket",
  FREE_DAILY_ANALYSES: "3",
  PRO_DAILY_ANALYSES: "50",
});

function fakeExercise(slug: string, type: "read_aloud" | "free_speech") {
  return {
    id: `ex_${slug}`,
    slug,
    type,
    prompt: `Prompt for ${slug}`,
    referenceText: type === "read_aloud" ? "Read this text." : null,
    maxDurationSec: 60,
  };
}

export class FakeDb {
  users: User[] = [];
  subscriptions: Omit<Subscription, "id">[] = [];
  webhookEvents: { source: string; eventId: string; type: string }[] = [];
  attemptsToday = 0;
  /**
   * Round-trip time of the attempt count/insert, in ms. 0 = instant (default). Set it to let
   * parallel requests interleave the way they do against real Postgres (race tests).
   */
  queryDelayMs = 0;
  /**
   * Simulates two first requests racing: the next user upsert finds the row "created by the
   * other request" and fails with Prisma's unique-constraint error, like Postgres does.
   */
  simulateProvisioningRace = false;
  private nextId = 1;

  /** How many times the auth hook looked a user up by Clerk id (user-cache tests). */
  userLookupsByClerkId = 0;
  /** Every `attempt.findUnique` argument, so tests can check what a route loads. */
  attemptQueries: { select?: Record<string, unknown> }[] = [];

  user = {
    findUnique: async ({ where }: { where: { clerkUserId?: string; id?: string } }) => {
      if (where.id === undefined) this.userLookupsByClerkId++;
      return (
        this.users.find((u) =>
          where.id !== undefined ? u.id === where.id : u.clerkUserId === where.clerkUserId,
        ) ?? null
      );
    },

    upsert: async (args: {
      where: { clerkUserId: string };
      create: { clerkUserId: string; email: string | null };
    }) => {
      const existing = this.users.find((u) => u.clerkUserId === args.where.clerkUserId);
      if (existing) return existing;
      const user: User = {
        id: `user_${this.nextId++}`,
        clerkUserId: args.create.clerkUserId,
        email: args.create.email,
        onboarding: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      };
      this.users.push(user);
      if (this.simulateProvisioningRace) {
        this.simulateProvisioningRace = false;
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      return user;
    },

    update: async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
      const user = this.users.find((u) => u.id === where.id);
      if (!user) throw new Error("not found");
      Object.assign(user, data);
      return user;
    },
  };

  subscription = {
    findMany: async ({ where }: { where: { userId: string } }) =>
      this.subscriptions.filter((s) => s.userId === where.userId),
    findFirst: async ({ where }: { where: { userId: string } }) =>
      [...this.subscriptions]
        .filter((s) => s.userId === where.userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null,
    findUnique: async ({ where }: { where: { providerSubscriptionId: string } }) =>
      this.subscriptions.find((s) => s.providerSubscriptionId === where.providerSubscriptionId) ??
      null,
    upsert: async (args: {
      where: { providerSubscriptionId: string };
      create: Omit<Subscription, "id" | "updatedAt">;
      update: Partial<Subscription>;
    }) => {
      const existing = this.subscriptions.find(
        (s) => s.providerSubscriptionId === args.where.providerSubscriptionId,
      );
      if (existing) Object.assign(existing, args.update, { updatedAt: new Date() });
      else this.subscriptions.push({ ...args.create, updatedAt: new Date() });
    },
  };

  attempts: Attempt[] = [];
  /** Results written by the worker, keyed by attempt id (tests set them directly). */
  transcripts = new Map<string, { text: string; words: unknown }>();
  analyses = new Map<string, { overallScore: number; metrics: unknown; feedback: unknown }>();

  attempt = {
    /** Pre-set `attemptsToday` + any attempts the test created through the API. */
    /** Like the real query: our-fault failures don't count (NO_SPEECH does). */
    count: async ({ where }: { where: { userId: string } }) => {
      if (this.queryDelayMs) await delay(this.queryDelayMs);
      return (
        this.attemptsToday +
        this.attempts.filter(
          (a) =>
            a.userId === where.userId && !(a.status === "failed" && a.errorCode !== "NO_SPEECH"),
        ).length
      );
    },

    create: async ({
      data,
    }: {
      data: Pick<Attempt, "id" | "exerciseId" | "mimeType" | "audioKey"> & {
        userId?: string;
        funnelSessionId?: string;
        topic?: string;
      };
    }) => {
      if (this.queryDelayMs) await delay(this.queryDelayMs);
      const now = new Date();
      const attempt: Attempt = {
        ...data,
        userId: data.userId ?? null,
        funnelSessionId: data.funnelSessionId ?? null,
        topic: data.topic ?? null,
        status: "awaiting_upload",
        durationMs: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      };
      this.attempts.push(attempt);
      return { ...attempt };
    },

    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, unknown>;
    }) => {
      this.attemptQueries.push({ select });
      const attempt = this.attempts.find((a) => a.id === where.id);
      if (!attempt) return null;
      const exercise = this.findExercise(attempt.exerciseId);
      if (!exercise) throw new Error("attempt references a missing exercise");
      const { lesson: _lesson, ...exerciseFields } = exercise;
      // Like Prisma: relations come back only when the select asks for them.
      const wants = (relation: string) => !select || relation in select;
      return {
        ...attempt,
        exercise: exerciseFields,
        ...(wants("transcript") && { transcript: this.transcripts.get(attempt.id) ?? null }),
        ...(wants("analysis") && { analysis: this.analyses.get(attempt.id) ?? null }),
      };
    },

    /**
     * The user's attempts newest first (`orderBy: { createdAt: "desc" }`), with `take`;
     * optionally only one exercise's attempts that have a topic (practice modes).
     */
    findMany: async ({
      where,
      take,
    }: {
      where: { userId: string; exerciseId?: string; topic?: { not: null } };
      take?: number;
    }) =>
      [...this.attempts]
        .filter((a) => a.userId === where.userId)
        .filter((a) => where.exerciseId === undefined || a.exerciseId === where.exerciseId)
        .filter((a) => where.topic === undefined || a.topic !== null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take)
        .map((attempt) => ({
          ...attempt,
          exercise: { slug: this.findExercise(attempt.exerciseId)?.slug ?? "unknown" },
          analysis: this.analyses.get(attempt.id) ?? null,
        })),

    /** Newest match first, like `orderBy: { createdAt: "desc" }`. */
    findFirst: async ({ where }: { where: Partial<Attempt> }) =>
      [...this.attempts]
        .reverse()
        .find((a) =>
          Object.entries(where).every(([key, value]) => a[key as keyof Attempt] === value),
        ) ?? null,

    delete: async ({ where }: { where: { id: string } }) => {
      this.attempts = this.attempts.filter((a) => a.id !== where.id);
    },

    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const attempt = this.attempts.find((a) => a.id === where.id);
      if (!attempt) throw new Error("not found");
      return { ...attempt };
    },

    /** Like Postgres: matches on every `where` field, so a status condition really guards. */
    updateMany: async ({ where, data }: { where: Partial<Attempt>; data: Partial<Attempt> }) => {
      const matches = this.attempts.filter((a) =>
        Object.entries(where).every(([key, value]) => a[key as keyof Attempt] === value),
      );
      for (const attempt of matches) Object.assign(attempt, data);
      return { count: matches.length };
    },
  };

  funnelSessions: {
    id: string;
    tokenHash: string;
    answers: unknown;
    currentStep: string | null;
    userId: string | null;
    ipHash: string | null;
    claimedAt: Date | null;
  }[] = [];

  funnelSession = {
    create: async ({ data }: { data: { tokenHash: string; ipHash: string } }) => {
      const session = {
        id: `fs_${this.nextId++}`,
        answers: {},
        currentStep: null,
        userId: null,
        claimedAt: null,
        ...data,
      };
      this.funnelSessions.push(session);
      return { id: session.id };
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      this.funnelSessions.find((s) => s.tokenHash === where.tokenHash) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: object }) => {
      const session = this.funnelSessions.find((s) => s.id === where.id);
      if (!session) throw new Error("not found");
      Object.assign(session, data);
      return session;
    },
  };

  /** Funnel rows in the shape the public route selects (definition is raw JSON, unvalidated). */
  funnels: { slug: string; status: "draft" | "live"; version: number; definition: unknown }[] = [];

  funnel = {
    findUnique: async ({ where }: { where: { slug: string } }) =>
      this.funnels.find((f) => f.slug === where.slug) ?? null,
  };

  /**
   * Both Prisma transaction forms: an array of (already running) fake ops, or an interactive
   * callback that gets the client. The fake can't roll back — tests don't rely on rollback.
   */
  $transaction = async (arg: Promise<unknown>[] | ((tx: FakeDb) => Promise<unknown>)) =>
    typeof arg === "function" ? arg(this) : Promise.all(arg);

  webhookEvent = {
    /** Mirrors the @@unique([source, eventId]) index: a duplicate throws Prisma's P2002. */
    create: async ({ data }: { data: { source: string; eventId: string; type: string } }) => {
      if (this.webhookEvents.some((e) => e.source === data.source && e.eventId === data.eventId)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      this.webhookEvents.push(data);
      return data;
    },
  };

  /** Small content fixture in the shape our `select`s return: 1 free + 1 paid lesson. */
  content = {
    course: { slug: "speak-with-confidence", title: "Speak with Confidence", summary: "S" },
    lessons: [
      {
        slug: "find-your-pace",
        title: "Find your pace",
        order: 1,
        isFree: true,
        videoUrl: null,
        body: "## Pace",
        exercises: [fakeExercise("find-your-pace-read", "read_aloud")],
      },
      {
        slug: "power-of-the-pause",
        title: "The power of the pause",
        order: 2,
        isFree: false,
        videoUrl: "https://example.com/v.mp4",
        body: "## Pauses",
        exercises: [fakeExercise("power-of-the-pause-read", "read_aloud")],
      },
    ],
    baseline: fakeExercise("baseline", "read_aloud") as ReturnType<typeof fakeExercise> | null,
    /** The funnel's speaking checks (`check-<goal>`), standalone like the baseline. */
    speakingChecks: [
      fakeExercise("check-general", "free_speech"),
      fakeExercise("check-job-interviews", "free_speech"),
    ],
    /** Standalone practice exercises (drills, legends, challenges). */
    practice: [
      fakeExercise("drill-topic-coffee", "free_speech"),
      fakeExercise("legend-gettysburg", "read_aloud"),
      fakeExercise("mode-topic", "free_speech"),
    ],
  };

  course = {
    findMany: async () => [
      {
        ...this.content.course,
        lessons: this.content.lessons.map(({ slug, title, order, isFree, exercises }) => ({
          slug,
          title,
          order,
          isFree,
          exercises: exercises.map((e) => ({ slug: e.slug })),
        })),
      },
    ],
  };

  lesson = {
    findUnique: async ({ where }: { where: { slug: string } }) => {
      const lesson = this.content.lessons.find((l) => l.slug === where.slug);
      if (!lesson) return null;
      const { slug, title } = this.content.course;
      return { ...lesson, course: { slug, title } };
    },
  };

  /** Finds an exercise by id, with its lesson's `isFree` (null lesson = baseline). */
  private findExercise(id: string) {
    for (const lesson of this.content.lessons) {
      const exercise = lesson.exercises.find((e) => e.id === id);
      if (exercise) return { ...exercise, lesson: { isFree: lesson.isFree } };
    }
    const standalone = [
      this.content.baseline,
      ...this.content.speakingChecks,
      ...this.content.practice,
    ].find((e) => e?.id === id);
    return standalone ? { ...standalone, lesson: null } : null;
  }

  exercise = {
    findUnique: async ({ where }: { where: { slug?: string; id?: string } }) => {
      if (where.id !== undefined) return this.findExercise(where.id);
      if (where.slug === "baseline") return this.content.baseline;
      return (
        [...this.content.speakingChecks, ...this.content.practice].find(
          (e) => e.slug === where.slug,
        ) ?? null
      );
    },
    /** Standalone exercises whose slug starts with one of the `OR` prefixes. */
    findMany: async ({ where }: { where: { OR: { slug: { startsWith: string } }[] } }) =>
      this.content.practice.filter((e) =>
        where.OR.some((condition) => e.slug.startsWith(condition.slug.startsWith)),
      ),
  };

  /** Gives the (already provisioned) user an active Pro subscription. */
  makePro(userId: string) {
    this.subscriptions.push({
      userId,
      plan: "pro",
      status: "active",
      currentPeriodEnd: null,
      source: "paddle",
      providerCustomerId: "ctm_test",
      providerSubscriptionId: `sub_manual_${userId}`,
      lastEventAt: null,
      updatedAt: new Date(),
    });
  }

  // Structural fake: only the members above exist. The cast is the one deliberate escape
  // hatch from strict typing, confined to tests.
  asClient(): DbClient {
    return this as unknown as DbClient;
  }
}

/** Fake identity provider: token "valid:<clerkUserId>" is valid, anything else is rejected. */
export class FakeAuth implements AuthProvider {
  emailLookups = 0;
  failEmailLookup = false;

  async verifySessionToken(token: string) {
    if (!token.startsWith("valid:")) throw new Error("invalid token");
    return { clerkUserId: token.slice("valid:".length) };
  }

  async getPrimaryEmail(clerkUserId: string) {
    this.emailLookups++;
    if (this.failEmailLookup) throw new Error("Clerk API down");
    return `${clerkUserId}@example.com`;
  }
}

/** In-memory "bucket": tests put objects in `objects` to simulate a finished browser upload. */
export class FakeStorage implements Storage {
  objects = new Map<string, number>(); // key → size in bytes
  uploads: { key: string; contentType: string }[] = [];

  async createUpload(key: string, contentType: string): Promise<PresignedUpload> {
    this.uploads.push({ key, contentType });
    return {
      url: "https://s3.example.com/test-bucket",
      fields: { key, "Content-Type": contentType, Policy: "signed-policy" },
      maxBytes: 10 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async getObjectSize(key: string) {
    return this.objects.get(key) ?? null;
  }

  submitted: string[] = []; // keys whose "pending" tag was removed

  async markSubmitted(key: string) {
    this.submitted.push(key);
  }
}

/**
 * Payment provider fake. A webhook "verifies" when the paddle-signature header is "valid"; the
 * body is then our normalized event as JSON (the real Paddle parsing is unit-tested separately).
 */
export class FakePayments implements PaymentProvider {
  readonly source = "paddle" as const;
  plans() {
    return [{ id: "pro_monthly" as const, priceId: "pri_test_monthly" }];
  }
  createCheckout(user: { id: string; email: string | null }) {
    return {
      priceId: "pri_test_monthly",
      customData: { userId: user.id },
      customerEmail: user.email,
    };
  }
  async getPortalUrl({ providerCustomerId }: { providerCustomerId: string }) {
    return `https://sandbox-customer-portal.paddle.com/${providerCustomerId}`;
  }
  async verifyAndParseWebhook(rawBody: string, headers: Record<string, unknown>) {
    if (headers["paddle-signature"] !== "valid") throw new WebhookSignatureError();
    const event = JSON.parse(rawBody) as NormalizedEvent & { occurredAt: string };
    const occurredAt = new Date(event.occurredAt);
    if (event.kind === "ignored") return { ...event, occurredAt };
    return {
      ...event,
      occurredAt,
      subscription: {
        ...event.subscription,
        currentPeriodEnd: event.subscription.currentPeriodEnd
          ? new Date(event.subscription.currentPeriodEnd)
          : null,
      },
    };
  }
}

/** Bot check: tokens equal to "human" pass. */
export class FakeBotCheck implements BotCheck {
  async verify(token: string) {
    return token === "human";
  }
}

/** In-memory counter with the same semantics as the Redis limiter (no expiry needed in tests). */
export class FakeRateLimiter implements RateLimiter {
  counts = new Map<string, number>();
  async hit(key: string, limit: number) {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count <= limit;
  }
}

export class FakeQueue implements AnalysisQueue {
  enqueued: string[] = [];
  failNext = false;

  requestIds: (string | undefined)[] = [];

  async enqueueAnalysis(attemptId: string, requestId?: string) {
    this.requestIds.push(requestId);
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Redis unavailable");
    }
    // Mirrors BullMQ's jobId dedup: adding an existing id is a no-op.
    if (!this.enqueued.includes(attemptId)) this.enqueued.push(attemptId);
  }

  async close() {}
}

export function buildTestServer(
  opts: {
    db?: FakeDb;
    auth?: FakeAuth;
    storage?: FakeStorage;
    queue?: FakeQueue;
    rateLimiter?: FakeRateLimiter;
    /** null = billing not configured. Default: a FakePayments. */
    payments?: PaymentProvider | null;
    /** Override env values (e.g. low rate limits). */
    env?: Partial<Env>;
    logStream?: Writable;
    events?: AttemptEventHub;
  } = {},
) {
  const db = opts.db ?? new FakeDb();
  const auth = opts.auth ?? new FakeAuth();
  const up = async () => {};
  return buildServer({
    env: { ...testEnv, ...opts.env },
    ...(opts.logStream && { logStream: opts.logStream }),
    db: db.asClient(),
    auth,
    storage: opts.storage ?? new FakeStorage(),
    queue: opts.queue ?? new FakeQueue(),
    botCheck: new FakeBotCheck(),
    rateLimiter: opts.rateLimiter ?? new FakeRateLimiter(),
    locks: createInMemoryKeyedLock(),
    attemptEvents: opts.events ?? createAttemptEventHub(),
    payments: opts.payments === undefined ? new FakePayments() : opts.payments,
    healthChecks: { db: up, redis: up },
  });
}
