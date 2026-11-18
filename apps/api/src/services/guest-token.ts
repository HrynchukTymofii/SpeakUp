import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Guest tokens for the anonymous funnel (SPEC §9): 32 random bytes, shown to the browser once.
 * The DB stores only the SHA-256 hash, so a database leak doesn't hand out live sessions
 * (same idea as storing password hashes; a plain hash is enough because the token is random
 * and long, so there is nothing to brute-force).
 */
export function createGuestToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashGuestToken(token) };
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * IP addresses are personal data: we keep only a keyed hash (HMAC with a server secret), enough
 * to count requests per IP without being able to recover the IP. Unlike a plain SHA-256,
 * the secret stops anyone from hashing all ~4 billion IPv4 addresses to reverse it.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}
