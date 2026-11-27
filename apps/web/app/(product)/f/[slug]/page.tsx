import { FunnelResumeClient } from "../../start/funnel-client";
import { FunnelFromApi } from "./funnel-from-api";

/** `/f/<slug>` → resume where the visitor left off in this funnel (first visit: the first step). */
export default async function FunnelBySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FunnelFromApi slug={slug}>
      <FunnelResumeClient />
    </FunnelFromApi>
  );
}
