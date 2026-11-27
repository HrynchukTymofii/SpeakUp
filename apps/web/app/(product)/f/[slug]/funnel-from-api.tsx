import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadFunnel } from "@/funnel/load-funnel";
import { FunnelProviderClient } from "../../start/funnel-client";

/**
 * Loads `/f/<slug>`'s funnel on the server (validated, cached for a minute) and hands it to the
 * client shell. Unknown or draft slugs are a 404; `main` falls back to the bundled definition.
 */
export async function FunnelFromApi({ slug, children }: { slug: string; children: ReactNode }) {
  const loaded = await loadFunnel(slug);
  if (loaded.kind === "not_found") notFound();
  const { funnel } = loaded;
  return (
    <FunnelProviderClient
      slug={funnel.slug}
      version={funnel.version}
      definition={funnel.definition}
      basePath={`/f/${funnel.slug}`}
    >
      {children}
    </FunnelProviderClient>
  );
}
