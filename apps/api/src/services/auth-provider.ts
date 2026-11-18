import { createClerkClient, verifyToken } from "@clerk/backend";

/**
 * What the API needs from an identity provider. Routes and the auth hook depend on this
 * interface, not on Clerk directly — so tests use a fake, and only this file knows Clerk's API.
 */
export interface AuthProvider {
  /** Verifies a session JWT. Resolves with the provider's user id; rejects if invalid/expired. */
  verifySessionToken(token: string): Promise<{ clerkUserId: string }>;
  /** Looks up the user's primary email (one network call — used only when we create the user). */
  getPrimaryEmail(clerkUserId: string): Promise<string | null>;
}

export function createClerkAuthProvider(opts: {
  secretKey: string;
  /** Origins allowed to have issued the token (the `azp` claim) — our web app's URLs. */
  authorizedParties: string[];
}): AuthProvider {
  const clerk = createClerkClient({ secretKey: opts.secretKey });

  return {
    async verifySessionToken(token) {
      // Checks signature (against Clerk's public keys, fetched once and cached), expiry,
      // and that the token was issued for one of our own web origins.
      const payload = await verifyToken(token, {
        secretKey: opts.secretKey,
        authorizedParties: opts.authorizedParties,
      });
      if (!payload.sub) throw new Error("token has no subject");
      return { clerkUserId: payload.sub };
    },

    async getPrimaryEmail(clerkUserId) {
      const user = await clerk.users.getUser(clerkUserId);
      return user.primaryEmailAddress?.emailAddress ?? null;
    },
  };
}
