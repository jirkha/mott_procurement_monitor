#!/usr/bin/env node
/**
 * Post-ingest audit: souhrn kvality dat v DB po sběru.
 *
 * Kořen monorepa:
 *   npm run ingest:post-audit
 *
 * Env: stejné jako ostatní skripty — DATABASE_URL přes packages/db/.env nebo apps/web/.env.local.
 */
import { PrismaClient } from "@prisma/client";
import { ensureDatabaseUrl } from "./load-database-url.mjs";

ensureDatabaseUrl();

const prisma = new PrismaClient();

/** Fráze, které mají být po ingestu + UI filtru prakticky vyloučené z přehledu. */
const BLOCKED_PHRASES = [
  "přímé zadání",
  "prime zadani",
  "jednací řízení bez uveřejnění",
  "jednaci rizeni bez uverejneni",
];

function normalizeUrlForDedupe(input) {
  try {
    const u = new URL(input);
    u.hash = "";
    const cleanedPath = u.pathname.replace(/\/+$/, "");
    const queryParams = Array.from(u.searchParams.entries())
      .sort(([ak, av], [bk, bv]) => `${ak}=${av}`.localeCompare(`${bk}=${bv}`))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return `${u.origin.toLowerCase()}${cleanedPath}${queryParams ? `?${queryParams}` : ""}`;
  } catch {
    return input.trim().toLowerCase().replace(/\/+$/, "");
  }
}

async function main() {
  const now = new Date();

  const latestRun = await prisma.ingestionRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      stats: true,
    },
  });

  const total = await prisma.zakazka.count();
  const nullDeadline = await prisma.zakazka.count({ where: { deadline: null } });
  const nullPublished = await prisma.zakazka.count({ where: { publishedAt: null } });

  const sources = await prisma.source.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });

  console.log("=== Post-ingest audit ===");
  console.log(`Čas auditu: ${now.toISOString()}`);
  if (latestRun) {
    console.log(
      `Poslední IngestionRun: ${latestRun.id} | ${latestRun.status} | start ${latestRun.startedAt.toISOString()}`,
    );
    if (latestRun.finishedAt) {
      console.log(`  finishedAt: ${latestRun.finishedAt.toISOString()}`);
    }
    if (latestRun.stats && typeof latestRun.stats === "object") {
      const s = latestRun.stats;
      const keys = [
      "itemsFetched",
      "upserted",
      "downloadedCount",
      "upsertedCount",
      "persistedCount",
      "itemsCount",
    ];
      const parts = keys
        .filter((k) => s[k] != null)
        .map((k) => `${k}=${s[k]}`);
      if (parts.length) console.log(`  stats: ${parts.join(", ")}`);
    }
  } else {
    console.log("Poslední IngestionRun: (žádný záznam)");
  }
  console.log("");
  console.log(`Celkem Zakazka: ${total}`);
  console.log(`  deadline IS NULL: ${nullDeadline} (${total ? ((100 * nullDeadline) / total).toFixed(1) : 0} %)`);
  console.log(`  publishedAt IS NULL: ${nullPublished} (${total ? ((100 * nullPublished) / total).toFixed(1) : 0} %)`);
  console.log("");

  console.log("--- Podle zdroje (Source.name) ---");
  console.log(
    "zdroj\ttotal\tnull_deadline\t%_null_dead\tnull_pub\tblocked_phrase_in_db",
  );

  for (const s of sources) {
    const cnt = await prisma.zakazka.count({ where: { sourceId: s.id } });
    if (cnt === 0) continue;

    const nd = await prisma.zakazka.count({
      where: { sourceId: s.id, deadline: null },
    });
    const np = await prisma.zakazka.count({
      where: { sourceId: s.id, publishedAt: null },
    });

    const blockedWhere = {
      sourceId: s.id,
      OR: BLOCKED_PHRASES.flatMap((phrase) => [
        { title: { contains: phrase } },
        { description: { contains: phrase } },
      ]),
    };
    const blocked = await prisma.zakazka.count({ where: blockedWhere });

    const pct = ((100 * nd) / cnt).toFixed(1);
    console.log(
      `${s.name}\t${cnt}\t${nd}\t${pct}\t${np}\t${blocked}`,
    );
  }

  console.log("");
  const blockedExact = await prisma.zakazka.count({
    where: {
      OR: BLOCKED_PHRASES.flatMap((phrase) => [
        { title: { contains: phrase } },
        { description: { contains: phrase } },
      ]),
    },
  });
  console.log(
    `Řádky Zakazka s blokovanou frází v title/description (mělo by být 0 u nového ingestu): ${blockedExact}`,
  );
  console.log("");

  const dupRows = await prisma.$queryRaw`
    SELECT "sourceUrl" AS url, COUNT(*) AS cnt
    FROM "Zakazka"
    GROUP BY "sourceUrl"
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 25
  `;
  const dupList = Array.isArray(dupRows) ? dupRows : [];
  const dupUrlCount = dupList.length;
  const dupExtraRows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(cnt - 1), 0) AS extra
    FROM (
      SELECT COUNT(*) AS cnt FROM "Zakazka" GROUP BY "sourceUrl" HAVING COUNT(*) > 1
    ) t
  `;
  const extra =
    Array.isArray(dupExtraRows) && dupExtraRows[0]?.extra != null
      ? Number(dupExtraRows[0].extra)
      : 0;

  console.log("--- Duplicitní sourceUrl v DB (stejný řetězec, různé řádky) ---");
  console.log(`Počet unikátních URL s duplicitou (top 25 zobrazeno): ${dupUrlCount}+`);
  console.log(`Odhad „nadbytečných“ řádků (suma cnt-1 přes všechny duplicitní URL): ${extra}`);
  for (const row of dupList.slice(0, 15)) {
    console.log(`  ${row.cnt}x\t${row.url}`);
  }
  if (dupList.length > 15) console.log(`  … (+${dupList.length - 15} dalších v top 25)`);
  console.log("");

  const allUrls = await prisma.zakazka.findMany({
    select: { sourceUrl: true },
    distinct: ["sourceUrl"],
  });
  const normMap = new Map();
  for (const { sourceUrl } of allUrls) {
    const n = normalizeUrlForDedupe(sourceUrl);
    normMap.set(n, (normMap.get(n) ?? 0) + 1);
  }
  let normDupGroups = 0;
  let normDupExtra = 0;
  for (const c of normMap.values()) {
    if (c > 1) {
      normDupGroups++;
      normDupExtra += c - 1;
    }
  }
  console.log("--- Normalizovaná URL (bez #, seřazené query) ---");
  console.log(`Skupiny s více distinct sourceUrl řetězci: ${normDupGroups}`);
  console.log(`Odhad nadbytečných řádků po normalizaci: ${normDupExtra}`);
  console.log("");

  const evezaSuspicious = await prisma.zakazka.count({
    where: {
      source: { name: { contains: "EVEZA" } },
      sourceUrl: { contains: "eveza.cz" },
      NOT: { sourceUrl: { contains: "/zakazka/" } },
    },
  });
  console.log("--- EVEZA: řádky bez /zakazka/ v URL (možný profil místo detailu) ---");
  console.log(`Počet: ${evezaSuspicious}`);
  console.log("");

  console.log("=== Konec auditu ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
