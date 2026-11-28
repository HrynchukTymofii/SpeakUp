import { CONTROL_CHARS, type FunnelAttribution, FunnelAttributionSchema } from "@speakup/shared";

/** Same limit as FunnelAttributionSchema: longer values are cut, not rejected, so the session still gets created. */
const MAX_LENGTH = 200;

const UTM_PARAMS = {
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
  utmTerm: "utm_term",
} as const satisfies Record<Exclude<keyof FunnelAttribution, "referrerHost">, string>;

/**
 * First-touch attribution from the landing URL's query and `document.referrer`.
 *
 * Only the `utm_*` parameters and the referrer's HOST are read: other parameters (click ids,
 * emails pasted into links) and the referrer's path/query can carry personal data. A referrer
 * on one of `ownHosts` (the app or marketing host) is navigation inside SpeakUp, not a source.
 * Returns null when there is nothing to attribute.
 */
export function readAttribution(
  search: string,
  referrer: string,
  ownHosts: readonly string[],
): FunnelAttribution | null {
  const params = new URLSearchParams(search);
  const result: FunnelAttribution = {};

  for (const [key, param] of Object.entries(UTM_PARAMS) as [keyof typeof UTM_PARAMS, string][]) {
    // Control characters first (a `%00` is a NUL, which Postgres rejects), then trim and cut.
    const value = params.get(param)?.replace(CONTROL_CHARS, "").trim().slice(0, MAX_LENGTH).trim();
    if (value) result[key] = value;
  }

  const referrerHost = hostOf(referrer);
  const own = new Set(ownHosts.map((h) => h.toLowerCase()));
  if (referrerHost && !own.has(referrerHost)) result.referrerHost = referrerHost;

  return Object.keys(result).length > 0 ? result : null;
}

/** The referrer's hostname, or null when it is empty, not a URL or not a plain hostname (e.g. an IP v6 literal). */
function hostOf(referrer: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  return FunnelAttributionSchema.shape.referrerHost.safeParse(host).success && host ? host : null;
}
