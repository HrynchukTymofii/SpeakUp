-- The worker's stuck-attempt sweeper looks for queued/processing attempts not updated recently,
-- every few minutes on every worker; this keeps that query off a full table scan.
-- Additive only: the running version is unaffected.
CREATE INDEX "Attempt_status_updatedAt_idx" ON "Attempt"("status", "updatedAt");
