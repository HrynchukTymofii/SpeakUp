-- Funnels in the DB (issue #48). Expand step only: a new enum and table, nullable columns on
-- FunnelSession, an FK and indexes. Nothing is dropped, renamed or made NOT NULL on an existing
-- table, so the running API (which never reads these columns) keeps working during the deploy.

-- CreateEnum
CREATE TYPE "FunnelStatus" AS ENUM ('draft', 'live');

-- AlterTable
ALTER TABLE "FunnelSession" ADD COLUMN     "funnelId" TEXT,
ADD COLUMN     "funnelVersion" INTEGER,
ADD COLUMN     "referrerHost" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT,
ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "Funnel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FunnelStatus" NOT NULL DEFAULT 'draft',
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Funnel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Funnel_slug_key" ON "Funnel"("slug");

-- CreateIndex
CREATE INDEX "FunnelSession_funnelId_createdAt_idx" ON "FunnelSession"("funnelId", "createdAt");

-- AddForeignKey
ALTER TABLE "FunnelSession" ADD CONSTRAINT "FunnelSession_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
