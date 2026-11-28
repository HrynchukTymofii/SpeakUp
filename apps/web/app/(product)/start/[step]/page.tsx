import { DefaultFunnel, FunnelStepClient } from "../funnel-client";

// One URL per step (SPEC §11), so back/forward and analytics work.
export default async function FunnelStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  return (
    <DefaultFunnel>
      <FunnelStepClient stepId={step} />
    </DefaultFunnel>
  );
}
