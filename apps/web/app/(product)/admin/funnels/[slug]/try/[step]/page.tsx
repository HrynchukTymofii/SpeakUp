import { FunnelStepClient } from "../../../../../start/funnel-client";

/** One step of the test run, rendered exactly like `/f/<slug>/<step>`. */
export default async function TryFunnelStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  return <FunnelStepClient stepId={step} />;
}
