import { z } from "zod";

/** Proves a request comes from a human in a browser (SPEC §9: anonymous recordings cost money). */
export interface BotCheck {
  verify(token: string, ip: string): Promise<boolean>;
}

const SiteverifyResponseSchema = z.object({ success: z.boolean() });

/**
 * Cloudflare Turnstile. The browser widget produces a one-time token; we confirm it server-side
 * with our secret. Tokens are single-use and expire after 5 minutes, so a replayed token fails.
 * Cloudflare's documented test secret `1x0000000000000000000000000000000AA` always passes (dev).
 */
export function createTurnstileBotCheck(secretKey: string): BotCheck {
  return {
    async verify(token, ip) {
      try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: new URLSearchParams({ secret: secretKey, response: token, remoteip: ip }),
          signal: AbortSignal.timeout(10_000),
        });
        const parsed = SiteverifyResponseSchema.safeParse(await res.json());
        return parsed.success && parsed.data.success;
      } catch {
        // Fail closed: if we can't verify, we don't spend money on an anonymous recording.
        return false;
      }
    },
  };
}
