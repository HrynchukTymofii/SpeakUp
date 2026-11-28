import { ErrorCode } from "@speakup/shared";
import type { FastifyInstance } from "fastify";
import { currentUser } from "./auth.js";
import { AppError } from "./error-handler.js";

/**
 * Makes every route registered on `scope` admin-only. `scope` must sit inside a `requireAuth`
 * scope: the parent's hook has already verified the token and set the user when this one runs.
 *
 * Admins are the Clerk user ids in ADMIN_CLERK_USER_IDS (an empty list = nobody). Checked in
 * `onRequest`, before the body is parsed, so non-admins learn nothing about the routes' input.
 */
export function requireAdmin(scope: FastifyInstance, adminClerkUserIds: readonly string[]) {
  const admins = new Set(adminClerkUserIds);
  scope.addHook("onRequest", async (request) => {
    if (!admins.has(currentUser(request).clerkUserId)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, "Admins only");
    }
  });
}
