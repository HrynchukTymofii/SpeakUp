import { buildManifest } from "@/lib/pwa/manifest";

/**
 * The manifest as a plain route rather than `app/manifest.ts`: Next links `app/manifest.ts` from
 * every page, including the marketing host, while this file is linked only by the product layout.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(buildManifest()), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
