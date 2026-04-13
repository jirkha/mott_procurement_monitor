import { fetchWithTimeout, mapWithConcurrency, nowMs, resolvePositiveInt } from "./perf";
import {
  NKOD_MMR_AGGREGATE_DATASETS,
  type NkodMmrAggregateDataset,
} from "./source-config";

const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const FETCH_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_NKOD_CONCURRENCY,
  2,
);

export type NkodMmrAggregateSnapshot = {
  sourceLabel: string;
  rowCount: number;
  latestYear: number | null;
  metadataUrl: string;
  xmlUrl: string;
};

type AggregateBatch = {
  snapshots: NkodMmrAggregateSnapshot[];
  timingsMs: Record<string, number>;
};

function parseLatestYear(xmlText: string): number | null {
  const years = Array.from(
    xmlText.matchAll(/<value>(20\d{2})<\/value>/g),
    (m) => Number(m[1]),
  ).filter((y) => Number.isFinite(y));
  if (!years.length) return null;
  return Math.max(...years);
}

function parseRowCount(xmlText: string): number {
  return (xmlText.match(/<row>/g) ?? []).length;
}

async function fetchAggregate(
  cfg: NkodMmrAggregateDataset,
): Promise<{ snapshot: NkodMmrAggregateSnapshot | null; durationMs: number }> {
  const startedAt = nowMs();
  try {
    const res = await fetchWithTimeout(
      cfg.xmlUrl,
      { cache: "no-store" },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn(`[NKOD-MMR ${cfg.name}] HTTP ${res.status} — přeskočeno.`);
      return { snapshot: null, durationMs: Math.round(nowMs() - startedAt) };
    }
    const xmlText = await res.text();
    const rowCount = parseRowCount(xmlText);
    const latestYear = parseLatestYear(xmlText);
    return {
      snapshot: {
        sourceLabel: cfg.sourceLabel,
        rowCount,
        latestYear,
        metadataUrl: cfg.metadataUrl,
        xmlUrl: cfg.xmlUrl,
      },
      durationMs: Math.round(nowMs() - startedAt),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[NKOD-MMR ${cfg.name}] ${msg}`);
    return { snapshot: null, durationMs: Math.round(nowMs() - startedAt) };
  }
}

export async function getNkodMmrAggregatesWithStats(): Promise<AggregateBatch> {
  const batches = await mapWithConcurrency(
    NKOD_MMR_AGGREGATE_DATASETS,
    FETCH_CONCURRENCY,
    async (cfg) => {
      const result = await fetchAggregate(cfg);
      return { ...result, name: cfg.name };
    },
  );
  const timingsMs: Record<string, number> = {};
  for (const batch of batches) {
    timingsMs[`nkod-mmr:${batch.name}`] = batch.durationMs;
  }
  return {
    snapshots: batches
      .map((b) => b.snapshot)
      .filter((s): s is NkodMmrAggregateSnapshot => s !== null),
    timingsMs,
  };
}
