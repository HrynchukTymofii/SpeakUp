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

    request.user = await findOrCreateUser(deps, clerkUserId, request);
  });
}

/**
 * Lazy provisioning: the first authenticated request creates our `User` row.
 * No Clerk webhook is needed to keep users in sync for the MVP.
 *
 * Fast path is a single indexed lookup. On first sight we fetch the email from Clerk, then
 * `upsert` — if two first requests race, both upserts converge on one row (clerkUserId is unique).
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

  const user = await deps.db.user.upsert({
    where: { clerkUserId },
    create: { clerkUserId, email },
    update: {},
  });
  request.log.info({ userId: user.id }, "user provisioned");
  return user;
}

/** The signed-in user. Only valid inside a scope protected by `requireAuth`. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw unauthenticated();
  return request.user;
}
