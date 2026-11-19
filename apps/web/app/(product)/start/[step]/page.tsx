import { FunnelStepClient } from "../funnel-client";

// One URL per step (SPEC §11), so back/forward and analytics work.
export default async function FunnelStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  return <FunnelStepClient stepId={step} />;
}
