import { FunnelStepClient } from "../../../start/funnel-client";

// One URL per step (SPEC §11), so back/forward and analytics work. The funnel comes from the layout.
export default async function FunnelBySlugStepPage({
  params,
}: {
  params: Promise<{ slug: string; step: string }>;
}) {
  const { step } = await params;
  return <FunnelStepClient stepId={step} />;
}
