import type { Prisma, PrismaClient } from "@prisma/client";
import { SourceKind } from "@prisma/client";
import { mergeLegacyJosephineSourcesIntoCanonical } from "@/lib/merge-legacy-josephine-source";
import { reclassifyAllStoredZakazky } from "@/lib/reclassify-stored";
import {
  allSourcesFetchedOkFromFailures,
} from "./full-success";
import { getAllZakazkyWithStats, setDisabledNenSlugs, setKnownDeadlineUrls, type SourceFailure } from "./fetcher";
import { initIngestProxy } from "./proxy-setup";
import { NEN_PROFILE_SLUGS } from "./source-config";
import { mapWithConcurrency, nowMs, resolvePositiveInt } from "./perf";
import { ACTIVE_AGGREGATORS, PILOT_AGGREGATORS } from "./source-config";
import type { IngestedZakazka } from "./types";

const SOURCE_UPSERT_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_SOURCE_UPSERT_CONCURRENCY,
  4,
);
const ZAKAZKA_UPSERT_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_ZAKAZKA_UPSERT_CONCURRENCY,
  12,
);

function slugifyDisplayName(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "unknown-source";
}

function guessSourceKind(zdroj: string): SourceKind {
  if (zdroj.startsWith("NEN")) return SourceKind.HYBRID;
  if (zdroj.startsWith("VVZ")) return SourceKind.RSS;
  if (zdroj.startsWith("NKOD")) return SourceKind.API;
  if (zdroj.startsWith("Hlídač státu")) return SourceKind.API;
  if (
    zdroj.includes("PROEBIZ") ||
    zdroj.includes("eGORDION") ||
    zdroj.includes("TenderArena")
  )
    return SourceKind.HYBRID;
  return SourceKind.SCRAPING;
}

function guessBaseUrl(zdroj: string): string | null {
  if (zdroj.startsWith("NEN")) return "https://nen.nipez.cz";
  if (zdroj.startsWith("VVZ")) return "https://vvz.nipez.cz";
  if (zdroj.startsWith("NKOD")) return "https://data.gov.cz";
  if (zdroj.startsWith("Hlídač státu")) return "https://www.hlidacstatu.cz";
  if (zdroj.startsWith("JOSEPHINE")) return "https://josephine.proebiz.com";
  if (zdroj.startsWith("Gemin")) return "https://www.gemin.cz";
  if (zdroj.includes("NajdiVZ")) return "https://www.najdivz.cz";
  if (zdroj.includes("TenderArena")) return "https://www.tenderarena.cz";
  if (zdroj.includes("PROEBIZ")) return "https://profily.proebiz.com";
  if (zdroj.includes("eGORDION")) return "https://www.egordion.cz";
  return null;
}

/** Zajistí záznam `Source` pro aktivní/pilot agregátory i bez uložených zakázek. */
async function ensurePilotAggregatorStubSources(prisma: PrismaClient) {
  const allAggregators = [...ACTIVE_AGGREGATORS, ...PILOT_AGGREGATORS];
  for (const p of allAggregators) {
    const slug = slugifyDisplayName(p.sourceLabel);
    const baseUrl =
      p.id === "najdivz"
        ? "https://www.najdivz.cz"
        : p.id === "gemin"
          ? "https://www.gemin.cz"
          : "https://josephine.proebiz.com";
    await prisma.source.upsert({
      where: { slug },
      create: {
        slug,
        name: p.sourceLabel,
        kind: SourceKind.SCRAPING,
        baseUrl,
      },
      update: {
        name: p.sourceLabel,
        baseUrl,
      },
    });
  }
  await mergeLegacyJosephineSourcesIntoCanonical(prisma);
}

const PILOT_SOURCE_IDS = new Set(PILOT_AGGREGATORS.map((p) => p.id));

export async function persistIngestedZakazky(
  prisma: PrismaClient,
  items: IngestedZakazka[],
): Promise<{
  upserted: number;
  touchedIds: string[];
  timingsMs: {
    sourceUpserts: number;
    zakazkaUpserts: number;
    total: number;
  };
}> {
  const startedAt = nowMs();
  let upserted = 0;
  const sourceLabelBySlug = new Map<string, string>();
  for (const item of items) {
    const slug = slugifyDisplayName(item.zdroj);
    if (!sourceLabelBySlug.has(slug)) sourceLabelBySlug.set(slug, item.zdroj);
  }

  const sourceIdBySlug = new Map<string, string>();
  const sourceStartedAt = nowMs();
  await mapWithConcurrency(
    Array.from(sourceLabelBySlug.entries()),
    SOURCE_UPSERT_CONCURRENCY,
    async ([slug, sourceLabel]) => {
      const source = await prisma.source.upsert({
        where: { slug },
        create: {
          slug,
          name: sourceLabel,
          kind: guessSourceKind(sourceLabel),
          baseUrl: guessBaseUrl(sourceLabel),
        },
        update: {
          name: sourceLabel,
        },
      });
      sourceIdBySlug.set(slug, source.id);
    },
  );
  const sourceUpsertsMs = Math.round(nowMs() - sourceStartedAt);

  const zakazkaStartedAt = nowMs();
  const touchedIds = await mapWithConcurrency(
    items,
    ZAKAZKA_UPSERT_CONCURRENCY,
    async (item) => {
      const slug = slugifyDisplayName(item.zdroj);
      const sourceId = sourceIdBySlug.get(slug);
      if (!sourceId) {
        throw new Error(`Missing source id for slug: ${slug}`);
      }

      const fetchedAt = new Date();

      const publishedAt = item.datum_publikace
        ? new Date(item.datum_publikace)
        : new Date(NaN);
      const recordUpdatedAt = item.datum_aktualizace
        ? new Date(item.datum_aktualizace)
        : new Date(NaN);
      const deadlineParsed = item.termin_podani_nabidky
        ? new Date(item.termin_podani_nabidky)
        : null;
      const deadline =
        deadlineParsed && !isNaN(deadlineParsed.getTime())
          ? deadlineParsed
          : null;
      const rawPayload = item as unknown as Prisma.InputJsonValue;

      const saved = await prisma.zakazka.upsert({
        where: {
          sourceId_externalRef: {
            sourceId,
            externalRef: item.id,
          },
        },
        create: {
          sourceId,
          externalRef: item.id,
          title: item.nazev,
          description: item.popis,
          sourceUrl: item.url,
          publishedAt: isNaN(publishedAt.getTime()) ? null : publishedAt,
          deadline,
          disciplina: item.disciplina,
          keywords: item.klicova_slova,
          recordUpdatedAt: isNaN(recordUpdatedAt.getTime()) ? null : recordUpdatedAt,
          lastFetchedAt: fetchedAt,
          rawPayload,
        },
        update: {
          title: item.nazev,
          description: item.popis,
          sourceUrl: item.url,
          publishedAt: isNaN(publishedAt.getTime()) ? null : publishedAt,
          deadline,
          disciplina: item.disciplina,
          keywords: item.klicova_slova,
          recordUpdatedAt: isNaN(recordUpdatedAt.getTime()) ? null : recordUpdatedAt,
          lastFetchedAt: fetchedAt,
          rawPayload,
        },
        select: { id: true },
      });
      upserted++;
      return saved.id;
    },
  );
  const zakazkaUpsertsMs = Math.round(nowMs() - zakazkaStartedAt);

  return {
    upserted,
    touchedIds: Array.from(new Set(touchedIds)),
    timingsMs: {
      sourceUpserts: sourceUpsertsMs,
      zakazkaUpserts: zakazkaUpsertsMs,
      total: Math.round(nowMs() - startedAt),
    },
  };
}

export type IngestionStats = {
  timingsMs: {
    fetchAll: number;
    persist: number;
    reclassify: number;
    total: number;
  };
  sourceTimingsMs: Record<string, number>;
  persistTimingsMs: {
    sourceUpserts: number;
    zakazkaUpserts: number;
    total: number;
  };
  reclassifyTimingsMs?: {
    fetchRows: number;
    updateRows: number;
    total: number;
  };
  reclassifiedScope: "all" | "touched";
  touchedIdsCount: number;
  sourceFailures: SourceFailure[];
  /** Žádný blokující záznam ve sourceFailures (viz full-success.ts). */
  allSourcesFetchedOk: boolean;
  analytics?: {
    nkodMmrAggregates: {
      sourceLabel: string;
      rowCount: number;
      latestYear: number | null;
      metadataUrl: string;
      xmlUrl: string;
    }[];
    pilotAggregators?: {
      sourceId: string;
      sourceLabel: string;
      downloadedCount: number;
      extractedCount: number;
      classifiedRatio: number;
      uniqueVsExistingCount: number;
      duplicateVsExistingCount: number;
      dedupeByUrlCount: number;
      dedupeByFallbackCount: number;
      goDecision: "go" | "no-go";
      reason: string;
      stability: {
        errorCode: string;
        requestFailed: boolean;
        timeoutCount: number;
        httpStatus: number | null;
        accessDenied: boolean;
        antiBotDetected: boolean;
      };
    }[];
    pilotDecisionTrend?: {
      sourceId: string;
      recentRuns: number;
      goCount: number;
      noGoCount: number;
      latestDecision: "go" | "no-go";
    }[];
    outboundLimiter?: {
      totals: {
        requests: number;
        status429: number;
        timeouts: number;
        cooldownWaitMs: number;
      };
      hosts: {
        host: string;
        requests: number;
        status429: number;
        timeouts: number;
        cooldownWaitMs: number;
        proxyCandidate: boolean;
      }[];
      proxyCandidates: {
        host: string;
        reason: string;
      }[];
    };
  };
};

export type IngestionResult = {
  ok: true;
  itemsFetched: number;
  upserted: number;
  runId: string;
  stats: IngestionStats;
};

export type IngestionFailure = {
  ok: false;
  error: string;
  runId: string;
};

export async function runIngestion(
  prisma: PrismaClient,
): Promise<IngestionResult | IngestionFailure> {
  const totalStartedAt = nowMs();
  const run = await prisma.ingestionRun.create({
    data: { status: "running" },
  });

  try {
    await initIngestProxy();

    const existingDeadlines = await prisma.zakazka.findMany({
      where: { deadline: { not: null } },
      select: { sourceUrl: true },
    });
    setKnownDeadlineUrls(existingDeadlines.map((z) => z.sourceUrl));

    const NEN_AUTO_DISABLE_RUN_THRESHOLD = 3;
    const recentRunsForAutoDisable = await prisma.ingestionRun.findMany({
      where: { status: "success" },
      orderBy: { startedAt: "desc" },
      take: NEN_AUTO_DISABLE_RUN_THRESHOLD,
      select: { stats: true },
    });
    if (recentRunsForAutoDisable.length >= NEN_AUTO_DISABLE_RUN_THRESHOLD) {
      const slugsToDisable: string[] = [];
      for (const slug of NEN_PROFILE_SLUGS) {
        const label = `NEN – ${slug}`;
        const failedInAll = recentRunsForAutoDisable.every((r) => {
          const stats = r.stats as { sourceFailures?: Array<{ sourceLabel?: string; reason?: string }> } | null;
          const failures = stats?.sourceFailures ?? [];
          return failures.some(
            (f) => f.sourceLabel === label && /timeout|abort/i.test(f.reason ?? ""),
          );
        });
        if (failedInAll) slugsToDisable.push(slug);
      }
      setDisabledNenSlugs(slugsToDisable);
    } else {
      setDisabledNenSlugs([]);
    }

    const fetchStartedAt = nowMs();
    const fetched = await getAllZakazkyWithStats();
    const fetchAllMs = Math.round(nowMs() - fetchStartedAt);

    const persistStartedAt = nowMs();
    const { upserted, touchedIds, timingsMs: persistTimingsMs } =
      await persistIngestedZakazky(prisma, fetched.items);
    await ensurePilotAggregatorStubSources(prisma);
    const persistMs = Math.round(nowMs() - persistStartedAt);

    const reclassifyStartedAt = nowMs();
    const reclassifyStats = await reclassifyAllStoredZakazky(prisma, {
      onlyIds: touchedIds,
    });
    const reclassifyMs = Math.round(nowMs() - reclassifyStartedAt);

    const recentSuccessfulRuns = await prisma.ingestionRun.findMany({
      where: { status: "success" },
      orderBy: { startedAt: "desc" },
      take: 9,
      select: { stats: true },
    });

    const pilotDecisionTrend = (() => {
      const trendMap = new Map<
        string,
        {
          recentRuns: number;
          goCount: number;
          noGoCount: number;
          latestDecision: "go" | "no-go";
        }
      >();

      const allRunsPilotStats = [
        fetched.analytics?.pilotAggregators ?? [],
        ...recentSuccessfulRuns.map((run) => {
          const statsObj = run.stats as
            | {
                analytics?: {
                  pilotAggregators?: Array<{
                    sourceId?: string;
                    goDecision?: "go" | "no-go";
                  }>;
                };
              }
            | null;
          return Array.isArray(statsObj?.analytics?.pilotAggregators)
            ? statsObj!.analytics!.pilotAggregators!
            : [];
        }),
      ];

      for (const runPilotRows of allRunsPilotStats) {
        for (const row of runPilotRows) {
          if (!row?.sourceId || !row?.goDecision) continue;
          if (!PILOT_SOURCE_IDS.has(row.sourceId as "najdivz" | "gemin")) continue;
          const existing = trendMap.get(row.sourceId) ?? {
            recentRuns: 0,
            goCount: 0,
            noGoCount: 0,
            latestDecision: row.goDecision,
          };
          existing.recentRuns += 1;
          if (row.goDecision === "go") existing.goCount += 1;
          else existing.noGoCount += 1;
          if (existing.recentRuns === 1) existing.latestDecision = row.goDecision;
          trendMap.set(row.sourceId, existing);
        }
      }

      return Array.from(trendMap.entries()).map(([sourceId, t]) => ({
        sourceId,
        recentRuns: t.recentRuns,
        goCount: t.goCount,
        noGoCount: t.noGoCount,
        latestDecision: t.latestDecision,
      }));
    })();

    const sourceFailures = fetched.sourceFailures ?? [];
    const stats: IngestionStats = {
      timingsMs: {
        fetchAll: fetchAllMs,
        persist: persistMs,
        reclassify: reclassifyMs,
        total: Math.round(nowMs() - totalStartedAt),
      },
      sourceTimingsMs: fetched.timingsMs,
      persistTimingsMs,
      reclassifyTimingsMs: reclassifyStats.durationsMs,
      reclassifiedScope: "touched",
      touchedIdsCount: touchedIds.length,
      sourceFailures,
      allSourcesFetchedOk: allSourcesFetchedOkFromFailures(sourceFailures),
      analytics: {
        nkodMmrAggregates: fetched.analytics?.nkodMmrAggregates ?? [],
        pilotAggregators: fetched.analytics?.pilotAggregators,
        outboundLimiter: fetched.analytics?.outboundLimiter,
        pilotDecisionTrend,
      },
    };

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "success",
        stats: {
          itemsFetched: fetched.items.length,
          upserted,
          reclassifyTotal: reclassifyStats.total,
          reclassifySetToNull: reclassifyStats.setToNull,
          ...stats,
        },
      },
    });

    return {
      ok: true,
      itemsFetched: fetched.items.length,
      upserted,
      runId: run.id,
      stats,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "error",
        errorLog: message,
      },
    });
    return { ok: false, error: message, runId: run.id };
  }
}
