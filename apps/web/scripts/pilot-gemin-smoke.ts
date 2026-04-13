/**
 * Rychlé ověření pilotu Gemin (3× čistý fetch + 1× kompletní merge metriky).
 * Spuštění: npx tsx apps/web/scripts/pilot-gemin-smoke.ts (z kořene monorepa)
 */
import { getAllZakazkyWithStats } from "../src/lib/ingestion/fetcher";
import { getGeminZakazkyWithStats } from "../src/lib/ingestion/gemin_fetcher";

async function main() {
  for (let i = 0; i < 3; i++) {
    const r = await getGeminZakazkyWithStats();
    console.log(
      JSON.stringify({
        phase: "gemin_only",
        run: i + 1,
        extracted: r.diagnostics.extractedCount,
        classifiedItems: r.items.length,
        classifiedRaw: r.diagnostics.classifiedCount,
        errorCode: r.diagnostics.errorCode,
        httpStatus: r.diagnostics.httpStatus,
        ms: r.timingsMs.pilotGeminMs,
      }),
    );
  }

  console.log(JSON.stringify({ phase: "full_fetch_start" }));
  const full = await getAllZakazkyWithStats();
  const gemin = full.analytics?.pilotAggregators?.find(
    (p) => p.sourceId === "gemin",
  );
  console.log(
    JSON.stringify({
      phase: "full_merge",
      gemin,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
