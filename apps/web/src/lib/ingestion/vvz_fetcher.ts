import { parseString } from "xml2js";
import { promisify } from "util";
import { classify } from "./classifier";
import {
  fetchWithTimeout,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
} from "./perf";
import { VVZ_RSS_FEEDS } from "./source-config";
import type { IngestedZakazka } from "./types";
import { tryDeadlineFromVvzPlainText } from "./vvz-deadline-heuristic";

const parseXml = promisify(parseString);
const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const FETCH_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_VVZ_CONCURRENCY,
  4,
);

type SourceBatch = {
  items: IngestedZakazka[];
  timingsMs: Record<string, number>;
};

type FeedItem = {
  title?: string[];
  description?: string[];
  link?: string[];
  guid?: Array<string | { _: string }>;
  pubDate?: string[];
  updated?: string[];
  id?: string[];
  summary?: string[];
  content?: string[];
};

function pickText(value: unknown): string | null {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (
      first &&
      typeof first === "object" &&
      "_" in first &&
      typeof (first as { _: unknown })._ === "string"
    ) {
      return (first as { _: string })._;
    }
  }
  return null;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRfc822Date(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function toIngested(
  item: FeedItem,
  feedUrl: string,
  i: number,
  sourceLabel: string,
): IngestedZakazka | null {
  const title = pickText(item.title) ?? "Bez názvu";
  const rawDesc =
    pickText(item.description) ?? pickText(item.summary) ?? pickText(item.content);
  const desc = rawDesc ? stripHtml(rawDesc) : null;

  const link = pickText(item.link);
  if (!link) return null;

  const pub = parseRfc822Date(pickText(item.pubDate));
  const upd = parseRfc822Date(pickText(item.updated));
  const pubIso = pub ? pub.toISOString() : null;
  const aktual = upd ?? pub;
  const aktIso = aktual ? aktual.toISOString() : null;

  const contentForClassifier = `${title} ${desc ?? ""}`;
  const { disciplina, klicova_slova } = classify(contentForClassifier);
  if (!disciplina) return null;

  const vzDeadline =
    tryDeadlineFromVvzPlainText(desc ?? "") ??
    tryDeadlineFromVvzPlainText(title);

  const guid =
    pickText(item.guid) ??
    pickText(item.id) ??
    `${feedUrl}-${link}-${i}`.replace(/[^a-zA-Z0-9-_.:/]/g, "");

  return {
    id: `vvz-${guid}`.replace(/\s+/g, "-"),
    zdroj: sourceLabel,
    nazev: title,
    popis: desc ? desc.slice(0, 1000) : null,
    url: link,
    datum_publikace: pubIso,
    datum_aktualizace: aktIso,
    termin_podani_nabidky: vzDeadline ? vzDeadline.toISOString() : null,
    disciplina,
    klicova_slova,
  };
}

async function fetchSingleFeed(
  feedUrl: string,
  sourceLabel: string,
): Promise<{ items: IngestedZakazka[]; durationMs: number }> {
  const startedAt = nowMs();
  try {
    const res = await fetchWithTimeout(
      feedUrl,
      { cache: "no-store" },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) {
      return { items: [], durationMs: Math.round(nowMs() - startedAt) };
    }

    const xml = await res.text();
    const parsed = (await parseXml(xml)) as {
      rss?: { channel?: Array<{ item?: FeedItem[] }> };
      feed?: { entry?: FeedItem[] };
    };

    const rssItems = parsed?.rss?.channel?.[0]?.item ?? [];
    const atomItems = parsed?.feed?.entry ?? [];
    const items = [...rssItems, ...atomItems];

    const out = items
      .map((item, i) => toIngested(item, feedUrl, i, sourceLabel))
      .filter((z): z is IngestedZakazka => z !== null);
    return { items: out, durationMs: Math.round(nowMs() - startedAt) };
  } catch (error) {
    console.error("VVZ RSS fetch error:", error);
    return { items: [], durationMs: Math.round(nowMs() - startedAt) };
  }
}

const DEFAULT_VVZ_LABEL = "VVZ / IS VZ (RSS)";

export async function getVvzZakazkyWithStats(): Promise<SourceBatch> {
  const batches = await mapWithConcurrency(
    VVZ_RSS_FEEDS,
    FETCH_CONCURRENCY,
    async (f) => {
      const result = await fetchSingleFeed(
        f.url,
        f.sourceLabel ?? DEFAULT_VVZ_LABEL,
      );
      return {
        ...result,
        label: f.sourceLabel ?? DEFAULT_VVZ_LABEL,
      };
    },
  );
  const timingsMs: Record<string, number> = {};
  for (const batch of batches) {
    timingsMs[`vvz:${batch.label}`] = batch.durationMs;
  }
  return { items: batches.flatMap((b) => b.items), timingsMs };
}

export async function getVvzZakazky(): Promise<IngestedZakazka[]> {
  const { items } = await getVvzZakazkyWithStats();
  return items;
}
