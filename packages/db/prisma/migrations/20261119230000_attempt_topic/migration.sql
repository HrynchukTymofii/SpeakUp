-- Practice modes: one exercise serves many topics; the attempt records which one.
-- Nullable, so the running version (which never writes it) keeps working (expand step).
ALTER TABLE "Attempt" ADD COLUMN "topic" TEXT;
