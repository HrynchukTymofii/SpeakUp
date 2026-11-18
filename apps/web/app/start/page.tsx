import { FunnelResumeClient } from "./funnel-client";

/** `/start` → resume where the visitor left off (first visit: the first step). */
export default function FunnelStartPage() {
  return <FunnelResumeClient />;
}
