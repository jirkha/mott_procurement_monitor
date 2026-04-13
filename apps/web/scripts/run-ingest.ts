/**
 * Jednorázový sběr zakázek stejně jako POST /api/refresh (bez HTTP, přímo do DB).
 * Po úpravách v `src/lib/ingestion/` spusťte, aby se v UI zobrazila aktuální data.
 *
 * Z kořene monorepa: npm run ingest
 * Z apps/web: npm run ingest:run
 *
 * DATABASE_URL se doplní z packages/db/.env nebo apps/web/.env.local (viz load-database-url.mjs).
 */
import { ensureDatabaseUrl } from "./load-database-url.mjs";
import { PrismaClient } from "@prisma/client";
import { runIngestion } from "../src/lib/ingestion/ingest-to-db";
ensureDatabaseUrl();

const prisma = new PrismaClient();

async function main() {
  console.log("[ingest] Zahajuji sběr zakázek (runIngestion)…");
  const result = await runIngestion(prisma);
  if (!result.ok) {
    console.error("[ingest] Chyba:", result.error, "runId:", result.runId);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[ingest] Hotovo. Staženo: ${result.itemsFetched}, upsert: ${result.upserted}, runId: ${result.runId}`,
  );
  console.log(
    "[ingest] Celkový čas:",
    `${Math.round(result.stats.timingsMs.total / 1000)}s`,
    "(fetch + persist + reklasifikace)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
