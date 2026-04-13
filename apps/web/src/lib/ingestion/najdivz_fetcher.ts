import { detectLikelyAntiBotWall } from "./anti-bot-html";
import { classify } from "./classifier";
import { fetchWithTimeout, nowMs, resolvePositiveInt } from "./perf";
import { PILOT_AGGREGATORS } from "./source-config";
import type { IngestedZakazka } from "./types";
import type { PilotFetcherDiagnostics, PilotSourceBatch } from "./josephine_fetcher";

const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const MAX_ITEMS = resolvePositiveInt(process.env.INGEST_PILOT_MAX_ITEMS, 120);
const PILOT_THROTTLE_MS = resolvePositiveInt(
  process.env.INGEST_PILOT_THROTTLE_MS,
  0,
);

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(input: string): string {
  return decodeHtml(input.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseCzDateToIso(value: string): string | null {
  const m = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = m[3];
  const iso = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}

export async function getNajdiVzZakazkyWithStats(): Promise<PilotSourceBatch> {
  const source = PILOT_AGGREGATORS.find((s) => s.id === "najdivz");
  if (!source) {
    return {
      items: [],
      timingsMs: {},
      diagnostics: {
        errorCode: "config_missing",
        httpStatus: null,
        timeoutCount: 0,
        requestFailed: true,
        accessDenied: false,
        antiBotDetected: false,
        extractedCount: 0,
        classifiedCount: 0,
      },
    };
  }

  const startedAt = nowMs();
  const diagnostics: PilotFetcherDiagnostics = {
    errorCode: "ok",
    httpStatus: null,
    timeoutCount: 0,
    requestFailed: false,
    accessDenied: false,
    antiBotDetected: false,
    extractedCount: 0,
    classifiedCount: 0,
  };

  try {
    await delay(PILOT_THROTTLE_MS);
    const res = await fetchWithTimeout(
      source.listingUrl,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "MOTT-monitor/1.0 (+pilot-ingestion)",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    diagnostics.httpStatus = res.status;
    diagnostics.accessDenied = res.status === 401 || res.status === 403;
    diagnostics.requestFailed = !res.ok;

    if (!res.ok) {
      diagnostics.errorCode = "http_error";
      return {
        items: [],
        timingsMs: {
          pilotNajdivzMs: Math.round(nowMs() - startedAt),
        },
        diagnostics,
      };
    }

    const html = await res.text();
    if (!html.trim()) {
      diagnostics.requestFailed = true;
      diagnostics.errorCode = "parse_empty_html";
      return {
        items: [],
        timingsMs: {
          pilotNajdivzMs: Math.round(nowMs() - startedAt),
        },
        diagnostics,
      };
    }
    diagnostics.antiBotDetected = detectLikelyAntiBotWall(html);
    if (diagnostics.antiBotDetected) {
      diagnostics.errorCode = "anti_bot";
      console.warn("[NajdiVZ pilot] Detekován anti-bot signál.");
    }

    const patterns = [
      /<tr>\s*<td[^>]*>([\d]{2}\.[\d]{2}\.[\d]{4})<\/td>\s*<td[^>]*><a[^>]+href="([^"]+\/verejne-zakazky\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]+href="([^"]+\/verejne-zakazky\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ];
    const rows: Array<{ dateStr: string; href: string; titleHtml: string }> = [];
    const seenAnchors = new Set<string>();
    for (const match of Array.from(html.matchAll(patterns[0]))) {
      rows.push({ dateStr: match[1], href: match[2], titleHtml: match[3] });
      seenAnchors.add(match[2]);
    }
    for (const match of Array.from(html.matchAll(patterns[1]))) {
      if (seenAnchors.has(match[1])) continue;
      rows.push({
        dateStr: "",
        href: match[1],
        titleHtml: match[2],
      });
    }
    diagnostics.extractedCount = rows.length;
    if (!rows.length && diagnostics.errorCode === "ok") {
      diagnostics.errorCode = "parse_no_matches";
    }

    const seen = new Set<string>();
    const items: IngestedZakazka[] = [];

    for (const row of rows) {
      if (items.length >= MAX_ITEMS) break;
      const dateStr = row.dateStr;
      const relativeUrl = row.href;
      const title = stripTags(row.titleHtml);
      if (!title) continue;

      const url = new URL(relativeUrl, source.listingUrl).toString();
      if (seen.has(url)) continue;
      seen.add(url);

      const parsedDate = dateStr.trim() ? parseCzDateToIso(dateStr) : null;

      const { disciplina, klicova_slova } = classify(title);
      if (!disciplina) continue;
      diagnostics.classifiedCount++;

      const idSuffix = url.match(/-(\d+)\/?$/)?.[1] ?? String(items.length + 1);
      items.push({
        id: `najdivz-${idSuffix}`,
        zdroj: source.sourceLabel,
        nazev: title,
        popis: null,
        url,
        datum_publikace: parsedDate,
        datum_aktualizace: parsedDate,
        termin_podani_nabidky: null,
        disciplina,
        klicova_slova,
      });
    }

    return {
      items,
      timingsMs: {
        pilotNajdivzMs: Math.round(nowMs() - startedAt),
      },
      diagnostics,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    diagnostics.requestFailed = true;
    diagnostics.timeoutCount = /aborted|timeout/i.test(msg) ? 1 : 0;
    diagnostics.errorCode = diagnostics.timeoutCount > 0 ? "timeout" : "unknown_error";
    return {
      items: [],
      timingsMs: {
        pilotNajdivzMs: Math.round(nowMs() - startedAt),
      },
      diagnostics,
    };
  }
}
