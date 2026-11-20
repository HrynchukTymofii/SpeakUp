import { ErrorCode } from "@speakup/shared";
import type { DbClient, User } from "@speakup/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthProvider } from "../services/auth-provider.js";
import { AppError } from "./error-handler.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the auth hook on protected routes. Read it via `currentUser(request)`. */
    user: User | null;
  }
}

const unauthenticated = () =>
  new AppError(401, ErrorCode.UNAUTHENTICATED, "Missing or invalid session token");

/** Extracts the token from `Authorization: Bearer <token>`. */
function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/**
 * Makes every route registered on `scope` require a signed-in user.
 *
 * Applied per scope (not globally) on purpose: /health, webhooks and the guest-token funnel
 * routes live in other scopes and must NOT require a Clerk session (SPEC §7).
 *
 * Identity comes only from the verified token — never from the body or query (SPEC §9).
 */
export function requireAuth(scope: FastifyInstance, deps: { auth: AuthProvider; db: DbClient }) {
  scope.decorateRequest("user", null);
  const users = createUserCache();

  scope.addHook("onRequest", async (request) => {
    const token = bearerToken(request);
    if (!token) throw unauthenticated();

    let clerkUserId: string;
    try {
      ({ clerkUserId } = await deps.auth.verifySessionToken(token));
    } catch (err) {
      request.log.info({ err: (err as Error).message }, "token verification failed");
      throw unauthenticated();
    }

    const cached = users.get(clerkUserId);
    if (cached) {
      request.user = cached;
      return;
    }
    request.user = await findOrCreateUser(deps, clerkUserId, request);
    users.set(clerkUserId, request.user);
  });
}

/**
 * The signed-in user, kept per process for a minute. Without it every request started with a
 * DB lookup: the load test measured ~3.6 Postgres queries per API request, most of them from
 * result polling. Routes only use the cached row for `id` (which never changes); anything that
 * must be fresh (GET /me's onboarding answers) reads the row itself.
 */
const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 10_000;

function createUserCache() {
  const entries = new Map<string, { user: User; expiresAt: number }>();
  return {
    get(clerkUserId: string): User | null {
      const entry = entries.get(clerkUserId);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        entries.delete(clerkUserId);
        return null;
      }
      return entry.user;
    },
    set(clerkUserId: string, user: User) {
      // Map keeps insertion order: when full, drop the oldest entry.
      if (entries.size >= USER_CACHE_MAX) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(clerkUserId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    },
  };
}

/**
 * Lazy provisioning: the first authenticated request creates our `User` row.
 * No Clerk webhook is needed to keep users in sync for the MVP.
 *
 * Fast path is a single indexed lookup. On first sight we fetch the email from Clerk, then
 * `upsert`. Postgres runs an upsert as insert-or-update, not atomically: when two first requests
 * race (a new user's first screen loads several things at once), the loser's insert fails on the
 * unique `clerkUserId` (Prisma P2002). The row then exists, so we simply read it.
 */
async function findOrCreateUser(
  deps: { auth: AuthProvider; db: DbClient },
  clerkUserId: string,
  request: FastifyRequest,
): Promise<User> {
  const existing = await deps.db.user.findUnique({ where: { clerkUserId } });
  if (existing) return existing;

  let email: string | null = null;
  try {
    email = await deps.auth.getPrimaryEmail(clerkUserId);
  } catch (err) {
    // Email is optional (nullable column) — don't block sign-in on a Clerk API hiccup.
    request.log.warn({ err: (err as Error).message }, "could not fetch email from Clerk");
  }

  try {
    const user = await deps.db.user.upsert({
      where: { clerkUserId },
      create: { clerkUserId, email },
      update: {},
    });
    request.log.info({ userId: user.id }, "user provisioned");
    return user;
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    const winner = await deps.db.user.findUnique({ where: { clerkUserId } });
    if (!winner) throw err;
    return winner;
  }
}

/** The signed-in user. Only valid inside a scope protected by `requireAuth`. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw unauthenticated();
  return request.user;
}
