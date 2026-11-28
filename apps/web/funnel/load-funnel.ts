import {
  DEFAULT_FUNNEL_DEFINITION,
  DEFAULT_FUNNEL_REVISION,
  DEFAULT_FUNNEL_SLUG,
  FunnelResponseSchema,
  FunnelSlugSchema,
  type FunnelResponse,
} from "@speakup/shared";
import { publicEnv } from "@/lib/env";

/**
 * Server-only: loads the funnel `/f/<slug>` renders, in its RSC layout. The definition is validated
 * here (FunnelDefinitionSchema via FunnelResponseSchema) so the browser gets only checked data.
 */

export type LoadedFunnel = { kind: "ok"; funnel: FunnelResponse["funnel"] } | { kind: "not_found" };

/** Ad traffic shouldn't wait long on the API: past this the page falls back or errors. */
const TIMEOUT_MS = 3000;
/** Next caches the response this long (the API sends the same max-age). */
const REVALIDATE_SECONDS = 60;

const BUNDLED_MAIN: LoadedFunnel = {
  kind: "ok",
  funnel: {
    slug: DEFAULT_FUNNEL_SLUG,
    version: DEFAULT_FUNNEL_REVISION,
    definition: DEFAULT_FUNNEL_DEFINITION,
  },
};

/**
 * `main` never fails: when the API is down, slow, answers 404 or sends an invalid definition, it
 * renders the bundled default (the same one `/start` uses), so paid traffic keeps converting.
 * Other slugs: 404 → `not_found` (the page shows a 404); any other failure throws (error page).
 * An invalid slug is a 404 without a request.
 */
export async function loadFunnel(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedFunnel> {
  if (!FunnelSlugSchema.safeParse(slug).success) return { kind: "not_found" };
  try {
    const result = await fetchFunnel(slug, fetchImpl);
    if (result.kind === "not_found" && slug === DEFAULT_FUNNEL_SLUG) {
      console.warn("funnel main not found in the API, serving the bundled definition");
      return BUNDLED_MAIN;
    }
    return result;
  } catch (error) {
    if (slug !== DEFAULT_FUNNEL_SLUG) throw error;
    console.warn("funnel main failed to load, serving the bundled definition", {
      error: error instanceof Error ? error.message : String(error),
    });
    return BUNDLED_MAIN;
  }
}

async function fetchFunnel(slug: string, fetchImpl: typeof fetch): Promise<LoadedFunnel> {
  const res = await fetchImpl(`${publicEnv.NEXT_PUBLIC_API_URL}/v1/funnels/${slug}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) throw new Error(`GET /v1/funnels/${slug} failed with ${res.status}`);
  const { funnel } = FunnelResponseSchema.parse(await res.json());
  return { kind: "ok", funnel };
}
