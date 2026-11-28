import { FunnelResumeClient } from "../../../../start/funnel-client";

/** Test run without a step → resume where the admin left off (first visit: the first step). */
export default function TryFunnelPage() {
  return <FunnelResumeClient />;
}
