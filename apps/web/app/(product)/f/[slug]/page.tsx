import { FunnelResumeClient } from "../../start/funnel-client";

/** `/f/<slug>` → resume where the visitor left off in this funnel (first visit: the first step). */
export default function FunnelBySlugPage() {
  // The layout loaded the funnel and provides it.
  return <FunnelResumeClient />;
}
