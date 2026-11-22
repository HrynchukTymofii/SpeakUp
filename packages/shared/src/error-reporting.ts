import { REDACT_CENSOR, SENSITIVE_LOG_KEYS } from "./logging.js";

/**
 * The parts of an error-tracker (Sentry) event that can carry personal data. Structural, so this
 * package needs no Sentry dependency and the web app, API and worker share one rule.
 */
export interface ScrubbableEvent {
  request?: {
    url?: string;
    method?: string;
    headers?: { [key: string]: string };
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  user?: { id?: string | number };
  extra?: { [key: string]: unknown };
  breadcrumbs?: unknown;
}

/** Request headers worth seeing in an error report; everything else (credentials) is dropped. */
const SAFE_HEADERS = new Set(["user-agent", "content-type", "accept-language"]);
const SENSITIVE = new Set<string>(SENSITIVE_LOG_KEYS);

/**
 * Applied to every event before it is sent (Sentry `beforeSend`), SPEC §9: an error report holds
 * the error, the stack and our ids, never tokens, transcripts, emails, IPs or signed URLs.
 * Allowlists where possible, so a new header or field is dropped by default.
 */
export function scrubErrorEvent<T extends ScrubbableEvent>(event: T): T {
  const scrubbed: T = { ...event };

  if (event.request) {
    const { url, headers, cookies: _c, data: _d, query_string: _q, ...rest } = event.request;
    scrubbed.request = {
      ...rest,
      ...(url !== undefined && { url: url.split("?")[0] }),
      ...(headers && {
        headers: Object.fromEntries(
          Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
        ),
      }),
    };
  }

  if (event.user) {
    scrubbed.user = event.user.id === undefined ? {} : { id: event.user.id };
  }

  if (event.extra) {
    scrubbed.extra = Object.fromEntries(
      Object.entries(event.extra).map(([key, value]) => [
        key,
        SENSITIVE.has(key) ? REDACT_CENSOR : value,
      ]),
    );
  }

  delete scrubbed.breadcrumbs;
  return scrubbed;
}
