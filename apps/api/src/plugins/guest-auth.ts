import type { DbClient } from "@speakup/db";
import { ErrorCode } from "@speakup/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashGuestToken } from "../services/guest-token.js";
import { AppError } from "./error-handler.js";

export interface GuestSession {
  id: string;
  answers: unknown;
  userId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the guest hook on funnel routes. Read it via `currentGuest(request)`. */
    funnelSession: GuestSession | null;
  }
}

/** `Authorization: Guest <token>` (SPEC §9) — a separate scheme, never confused with a Clerk Bearer token. */
function guestToken(request: FastifyRequest): string | null {
  const [scheme, token] = (request.headers.authorization ?? "").split(" ");
  return scheme === "Guest" && token ? token : null;
}

/**
 * Makes every route on `scope` require a valid guest token. We look the session up by the
 * token's hash; the raw token never touches the DB or the logs (authorization is redacted).
 */
export function requireGuest(scope: FastifyInstance, deps: { db: DbClient }) {
  scope.decorateRequest("funnelSession", null);

  scope.addHook("onRequest", async (request) => {
    const token = guestToken(request);
    if (!token) {
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Missing or invalid guest token");
    }
    const session = await deps.db.funnelSession.findUnique({
      where: { tokenHash: hashGuestToken(token) },
      select: { id: true, answers: true, userId: true },
    });
    if (!session) {
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, "Missing or invalid guest token");
    }
    request.funnelSession = session;
  });
}

export function currentGuest(request: FastifyRequest): GuestSession {
  if (!request.funnelSession) throw new Error("currentGuest() used outside a requireGuest scope");
  return request.funnelSession;
}
