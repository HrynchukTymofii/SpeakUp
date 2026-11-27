import { FunnelStepClient } from "../../../start/funnel-client";
import { FunnelFromApi } from "../funnel-from-api";

// One URL per step (SPEC §11), so back/forward and analytics work.
export default async function FunnelBySlugStepPage({
  params,
}: {
  params: Promise<{ slug: string; step: string }>;
}) {
  const { slug, step } = await params;
  return (
    <FunnelFromApi slug={slug}>
      <FunnelStepClient stepId={step} />
    </FunnelFromApi>
  );
}
