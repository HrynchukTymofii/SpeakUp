import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadFunnel } from "@/funnel/load-funnel";
import FunnelLayout from "../../start/layout";
import { FunnelProviderClient } from "../../start/funnel-client";

// Same title and noindex as /start: both are the ad landing funnel.
export { metadata } from "../../start/layout";

/**
 * Loads `/f/<slug>`'s funnel on the server (validated, cached for a minute) and hands it to the
 * client shell. It lives in the layout, not the pages, so moving between steps neither refetches
 * the funnel nor remounts the provider. Unknown or draft slugs are a 404; `main` falls back to
 * the bundled definition. Any other load failure throws to `f/error.tsx` (a segment's own
 * error.tsx sits inside its layout, so it couldn't catch this).
 */
export default async function FunnelBySlugLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: ReactNode;
}) {
  const { slug } = await params;
  const loaded = await loadFunnel(slug);
  if (loaded.kind === "not_found") notFound();
  const { funnel } = loaded;
  return (
    <FunnelLayout>
      <FunnelProviderClient
        slug={funnel.slug}
        version={funnel.version}
        definition={funnel.definition}
        basePath={`/f/${funnel.slug}`}
      >
        {children}
      </FunnelProviderClient>
    </FunnelLayout>
  );
}
