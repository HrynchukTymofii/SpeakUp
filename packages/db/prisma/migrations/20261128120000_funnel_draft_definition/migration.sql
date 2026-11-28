-- Funnel editor drafts (issue #55). Expand only: one nullable column, so the running API (which
-- never reads it) keeps working during the deploy.

-- AlterTable
ALTER TABLE "Funnel" ADD COLUMN     "draftDefinition" JSONB;
