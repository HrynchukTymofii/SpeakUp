import { z } from "zod";

/**
 * Every API error has this shape (SPEC §7), so clients handle errors with one code path:
 * switch on `code` (stable, machine-readable), show `message`, report `requestId` to support.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Error codes clients may branch on. Add new ones here, never rename existing ones. */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** 400 — the request itself is malformed (e.g. broken JSON). */
  BAD_REQUEST: "BAD_REQUEST",
  /** 413 — body too large. */
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  /** 415 — wrong Content-Type (we accept JSON). */
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  /** 403 — content needs a higher plan. The UI shows an upgrade prompt for this code. */
  LESSON_LOCKED: "LESSON_LOCKED",
  NOT_FOUND: "NOT_FOUND",
  /** 402 — the action (e.g. recording a Pro exercise) needs a paid plan. */
  PAYWALL: "PAYWALL",
  /** 429 — the plan's daily analysis quota is used up. Resets at 00:00 UTC. */
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  /** 409 — the resource isn't in a state that allows this action (e.g. submit twice after failure). */
  WRONG_STATE: "WRONG_STATE",
  /** 409 — submit was called but no valid file is in storage (upload failed or was too big/small). */
  UPLOAD_MISSING: "UPLOAD_MISSING",
  /** 403 — the bot check (Cloudflare Turnstile) failed. */
  BOT_CHECK_FAILED: "BOT_CHECK_FAILED",
  /** 429 — too many requests (e.g. anonymous funnel analyses per IP per day). */
  RATE_LIMITED: "RATE_LIMITED",
  /** 503 — a feature isn't configured on this server (e.g. billing keys missing in dev). */
  NOT_CONFIGURED: "NOT_CONFIGURED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
