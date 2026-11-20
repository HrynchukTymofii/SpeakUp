import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthProvider } from "./auth-provider.js";

/**
 * LOAD TESTING ONLY (docs/load-testing.md). k6 needs thousands of signed-in users, but real
 * Clerk session tokens expire after 60 s and refreshing them at load would measure Clerk's
 * rate limits instead of our API. With `LOAD_TEST_AUTH_SECRET` set, the API also accepts
 * `lt.<userId>.<hmac>` tokens.
 *
 * Safety: the load-test path only ever resolves ids starting with `loadtest_`. Clerk ids
 * start with `user_`, so even a leaked secret can't act as a real user. The env check
 * refuses the secret in production unless `LOAD_TEST_STACK=true` too.
 */

const PREFIX = "lt.";
const USER_ID = /^loadtest_[A-Za-z0-9_-]{1,40}$/;

function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

/** Used by tests; k6 builds the same token with k6/crypto (load-tests/lib/auth.js). */
export function signLoadTestToken(userId: string, secret: string): string {
  return `${PREFIX}${userId}.${sign(userId, secret)}`;
}

function verify(token: string, secret: string): string {
  const body = token.slice(PREFIX.length);
  const dot = body.lastIndexOf(".");
  const userId = body.slice(0, dot);
  if (dot < 0 || !USER_ID.test(userId)) throw new Error("invalid load-test token");
  const given = Buffer.from(body.slice(dot + 1), "hex");
  const expected = Buffer.from(sign(userId, secret), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error("invalid load-test token");
  }
  return userId;
}

/** Wraps the real provider: `lt.` tokens are checked here, everything else goes to Clerk. */
export function withLoadTestAuth(real: AuthProvider, secret: string): AuthProvider {
  return {
    async verifySessionToken(token) {
      if (!token.startsWith(PREFIX)) return real.verifySessionToken(token);
      return { clerkUserId: verify(token, secret) };
    },
    async getPrimaryEmail(clerkUserId) {
      // Load-test users don't exist in Clerk; .invalid is a reserved, never-routable domain.
      if (USER_ID.test(clerkUserId)) return `${clerkUserId}@loadtest.invalid`;
      return real.getPrimaryEmail(clerkUserId);
    },
  };
}
