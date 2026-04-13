-- Backfill: approximate last fetch time for legacy rows (until next ingest overwrites).
UPDATE "Zakazka" SET "lastFetchedAt" = "updatedAt" WHERE "lastFetchedAt" IS NULL;
