/**
 * Log redaction shared by the API and the worker (SPEC §9: "don't log transcripts, audio URLs,
 * tokens or emails"). Relying on everyone to remember is fragile, so the loggers themselves
 * replace these fields — at the top level and one level deep — with "[redacted]".
 */
export const SENSITIVE_LOG_KEYS = [
  "email",
  "token",
  "guestToken",
  "turnstileToken",
  "authorization",
  "password",
  "secret",
  "apiKey",
  "transcript",
  "text",
  "words",
  "referenceText",
  "audioUrl",
  "downloadUrl",
  "fields", // pre-signed upload form fields (signed policy)
] as const;

export const REDACT_CENSOR = "[redacted]";

/**
 * pino `redact.paths` for the keys above, plus request headers that carry credentials.
 * Note: a generic "url" key is NOT redacted — Fastify logs the request path as `req.url`, which is
 * useful and safe (guest tokens never go in URLs; pre-signed URLs are never logged as `url`).
 */
export function logRedactPaths(): string[] {
  return [
    ...SENSITIVE_LOG_KEYS.flatMap((key) => [key, `*.${key}`]),
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["paddle-signature"]',
  ];
}
