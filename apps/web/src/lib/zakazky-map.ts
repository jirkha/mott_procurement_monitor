import type { ZakazkaListRow } from "@/types/zakazky";
import { XML_PROFILY_ZADAVATELU } from "@/lib/ingestion/source-config";
import { ZakazkaStatus, type Prisma } from "@prisma/client";

type ZakazkaWithSource = {
  id: string;
  title: string;
  description: string | null;
  sourceUrl: string;
  publishedAt: Date | null;
  deadline: Date | null;
  updatedAt: Date;
  disciplina: string | null;
  keywords: Prisma.JsonValue | null;
  rawPayload?: Prisma.JsonValue | null;
  recordUpdatedAt: Date | null;
  lastFetchedAt: Date | null;
  status: ZakazkaStatus;
  source: { name: string; baseUrl?: string | null };
};

function deriveProfileLandingUrl(xmlBaseUrl: string): string | null {
  try {
    const u = new URL(xmlBaseUrl);
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\/XMLdataVZ\/?$/i, "");
    return u.toString();
  } catch {
    return null;
  }
}

const xmlProfileLandingBySourceName = new Map<string, string>(
  XML_PROFILY_ZADAVATELU.map((row) => [
    row.name,
    deriveProfileLandingUrl(row.xmlBaseUrl) ?? row.xmlBaseUrl,
  ]),
);

function getHostnameSafe(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function collectHttpUrlsFromUnknown(node: unknown, out: string[], depth = 0): void {
  if (depth > 40 || out.length > 800) return;
  if (typeof node === "string") {
    const s = node.trim();
    if (/^https?:\/\//i.test(s)) out.push(s);
    const matches = s.match(/https?:\/\/[^\s"'<>]+/gi);
    if (matches) {
      for (const m of matches) {
        out.push(m.replace(/&amp;/g, "&"));
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectHttpUrlsFromUnknown(x, out, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectHttpUrlsFromUnknown(v, out, depth + 1);
    }
  }
}

function pickTenderArenaZakazkaDetailFromRaw(
  rawPayload: Prisma.JsonValue | null | undefined,
): string | null {
  if (!rawPayload) return null;
  const urls: string[] = [];
  collectHttpUrlsFromUnknown(rawPayload as unknown, urls);
  for (const u of urls) {
    if (
      /^https?:\/\/(?:www\.)?tenderarena\.cz\/dodavatel\/seznam-profilu-zadavatelu\/detail\/Z\d+\/zakazka\/\d+\b/i.test(
        u,
      )
    ) {
      return u;
    }
  }
  return null;
}

function mapBrokenNonNenNipezUrl(
  sourceUrl: string,
  sourceName: string,
  rawPayload: Prisma.JsonValue | null | undefined,
  sourceBaseUrl?: string | null,
): string {
  if (sourceName.includes("TenderArena")) {
    const taDetail = pickTenderArenaZakazkaDetailFromRaw(rawPayload);
    if (taDetail) return taDetail;
  }

  const host = getHostnameSafe(sourceUrl);
  const isNenDetail = /\/verejne-zakazky\/detail-zakazky\/[^/?#]+/i.test(sourceUrl);
  if (host !== "nen.nipez.cz" || !isNenDetail || sourceName.startsWith("NEN")) {
    return sourceUrl;
  }

  return (
    xmlProfileLandingBySourceName.get(sourceName) ??
    sourceBaseUrl ??
    sourceUrl
  );
}

function keywordsToList(value: Prisma.JsonValue | null): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string");
  }
  return [];
}

export function toZakazkaListRow(z: ZakazkaWithSource): ZakazkaListRow {
  const recordUpd =
    z.recordUpdatedAt && !isNaN(z.recordUpdatedAt.getTime())
      ? z.recordUpdatedAt.toISOString()
      : null;
  const lastFetched =
    z.lastFetchedAt && !isNaN(z.lastFetchedAt.getTime())
      ? z.lastFetchedAt.toISOString()
      : null;
  const recordDbUpdated =
    z.updatedAt && !isNaN(z.updatedAt.getTime())
      ? z.updatedAt.toISOString()
      : null;

  return {
    id: z.id,
    zdroj: z.source.name,
    nazev: z.title,
    popis: z.description,
    url: mapBrokenNonNenNipezUrl(
      z.sourceUrl,
      z.source.name,
      z.rawPayload,
      z.source.baseUrl,
    ),
    datum_publikace: z.publishedAt?.toISOString() ?? null,
    datum_aktualizace: recordUpd,
    naposledy_stazeno: lastFetched,
    naposledy_upraveno_zaznamu: recordDbUpdated,
    termin_podani_nabidky:
      z.deadline && !isNaN(z.deadline.getTime())
        ? z.deadline.toISOString()
        : null,
    disciplina: z.disciplina,
    klicova_slova: keywordsToList(z.keywords),
    status: z.status,
  };
}
