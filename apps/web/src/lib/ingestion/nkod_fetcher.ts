import { parse } from "csv-parse/sync";
import { classify } from "./classifier";
import {
  fetchWithTimeout,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
} from "./perf";
import {
  NKOD_CSV_COLUMNS_OICT_ZADANO,
  NKOD_CSV_DATASETS,
  type NkodCsvColumnMap,
  type NkodCsvDataset,
} from "./source-config";
import type { IngestedZakazka } from "./types";

const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const FETCH_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_NKOD_CONCURRENCY,
  2,
);

type SourceBatch = {
  items: IngestedZakazka[];
  timingsMs: Record<string, number>;
};

function resolveColumns(cfg: NkodCsvDataset): NkodCsvColumnMap {
  return { ...NKOD_CSV_COLUMNS_OICT_ZADANO, ...cfg.columns };
}

function parseFlexibleDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const x = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
    if (!isNaN(x.getTime())) return x;
  }
  return null;
}

/**
 * Řádek zařadit jen podle dat události zakázky, ne podle `updated_at` z CSV —
 * při hromadné aktualizaci souboru by jinak prošla celá historie.
 */
function rowInDateWindow(
  zahajeni: Date | null,
  uzavreno: Date | null,
  dateFrom: Date,
): boolean {
  if (zahajeni && zahajeni >= dateFrom) return true;
  if (uzavreno && uzavreno >= dateFrom) return true;
  return false;
}

function rowToIngested(
  row: Record<string, string>,
  cfg: NkodCsvDataset,
  cols: NkodCsvColumnMap,
  dateFrom: Date,
): IngestedZakazka | null {
  const sysno = (row[cols.systemKey] ?? "").trim();
  const nazev = (row[cols.title] ?? "").trim();
  if (!sysno || !nazev) return null;

  const popisRaw = (row[cols.description] ?? "")
    .trim()
    .replace(/\r\n/g, "\n");
  const popis = popisRaw ? popisRaw.slice(0, 1000) : null;

  const pub = parseFlexibleDate(row[cols.dateStart]);
  const uzavreno = parseFlexibleDate(row[cols.dateContractEnd]);
  const csvUpdated = parseFlexibleDate(row[cols.dateUpdated]);
  if (!rowInDateWindow(pub, uzavreno, dateFrom)) return null;

  const { disciplina, klicova_slova } = classify(`${nazev} ${popisRaw}`);
  if (!disciplina) return null;

  const basisUpd = csvUpdated ?? uzavreno ?? pub;
  if (!basisUpd) return null;

  const pubIso = pub ? pub.toISOString() : null;
  const updIso = basisUpd.toISOString();
  const url = `${cfg.landingPageUrl.replace(/\/$/, "")}#${encodeURIComponent(sysno)}`;

  return {
    id: `${cfg.idPrefix}-${sysno}`,
    zdroj: cfg.sourceLabel,
    nazev,
    popis,
    url,
    datum_publikace: pubIso,
    datum_aktualizace: updIso,
    termin_podani_nabidky: null,
    disciplina,
    klicova_slova,
  };
}

async function fetchNkodCsvDataset(
  cfg: NkodCsvDataset,
): Promise<{ items: IngestedZakazka[]; durationMs: number }> {
  const startedAt = nowMs();
  try {
    const res = await fetchWithTimeout(
      cfg.csvUrl,
      { cache: "no-store" },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn(`[NKOD ${cfg.name}] HTTP ${res.status} — přeskočeno.`);
      return { items: [], durationMs: Math.round(nowMs() - startedAt) };
    }

    const text = await res.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, string>[];

    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - 6);
    const minDate = new Date("2024-07-01");
    if (dateFrom < minDate) dateFrom.setTime(minDate.getTime());

    const cols = resolveColumns(cfg);
    const out: IngestedZakazka[] = [];
    for (const row of records) {
      const z = rowToIngested(row, cfg, cols, dateFrom);
      if (z) out.push(z);
    }
    return { items: out, durationMs: Math.round(nowMs() - startedAt) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[NKOD ${cfg.name}] ${msg}`);
    return { items: [], durationMs: Math.round(nowMs() - startedAt) };
  }
}

export async function getNkodZakazkyWithStats(): Promise<SourceBatch> {
  const batches = await mapWithConcurrency(
    NKOD_CSV_DATASETS,
    FETCH_CONCURRENCY,
    async (cfg) => {
      const result = await fetchNkodCsvDataset(cfg);
      return { ...result, name: cfg.name };
    },
  );
  const timingsMs: Record<string, number> = {};
  for (const batch of batches) {
    timingsMs[`nkod:${batch.name}`] = batch.durationMs;
  }
  return { items: batches.flatMap((b) => b.items), timingsMs };
}

export async function getNkodZakazky(): Promise<IngestedZakazka[]> {
  const { items } = await getNkodZakazkyWithStats();
  return items;
}
