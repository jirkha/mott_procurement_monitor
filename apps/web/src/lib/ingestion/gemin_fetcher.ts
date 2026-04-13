import { detectLikelyAntiBotWall } from "./anti-bot-html";
import { classify } from "./classifier";
import { parsePublicationFromEzakDetailHtml } from "./ezak_fetcher";
import {
  fetchWithTimeout,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
} from "./perf";
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
const GEMIN_DETAIL_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_GEMIN_DETAIL_CONCURRENCY,
  4,
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

function listingUrlsForSource(
  listingUrl: string,
  extra?: readonly string[] | undefined,
): string[] {
  const raw = [listingUrl, ...(extra ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of raw) {
    const norm = u.trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/**
 * Veřejné zakázky na Geminu: odkazy /verejne-zakazky/{slug} s titulkem v <strong>
 * (homepage i samostatná stránka přehledu).
 */
export async function getGeminZakazkyWithStats(): Promise<PilotSourceBatch> {
  if (process.env.INGEST_PILOT_DISABLE_GEMIN === "1") {
    return {
      items: [],
      timingsMs: {},
      diagnostics: {
        errorCode: "ok",
        httpStatus: null,
        timeoutCount: 0,
        requestFailed: false,
        accessDenied: false,
        antiBotDetected: false,
        extractedCount: 0,
        classifiedCount: 0,
      },
    };
  }

  const source = PILOT_AGGREGATORS.find((s) => s.id === "gemin");
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

  const urls = listingUrlsForSource(source.listingUrl, source.extraListingUrls);
  const rows: Array<{ url: string; title: string }> = [];
  const seenHrefs = new Set<string>();
  let lastHttpStatus: number | null = null;
  let sawAntiBot = false;
  let sawFailure = false;

  try {
    const patterns = [
      /<a href="(https?:\/\/www\.gemin\.cz\/verejne-zakazky\/[^"?#]+)(?:\?[^"]*)?"[^>]*><strong>([\s\S]*?)<\/strong><\/a>/gi,
      /<a href="(\/verejne-zakazky\/[^"?#]+)(?:\?[^"]*)?"[^>]*><strong>([\s\S]*?)<\/strong><\/a>/gi,
    ];

    for (const pageUrl of urls) {
      await delay(PILOT_THROTTLE_MS);
      const res = await fetchWithTimeout(
        pageUrl,
        {
          cache: "no-store",
          headers: {
            "User-Agent": "MOTT-monitor/1.0 (+gemin-ingestion)",
          },
        },
        FETCH_TIMEOUT_MS,
      );
      lastHttpStatus = res.status;
      diagnostics.httpStatus = res.status;
      if (res.status === 401 || res.status === 403) diagnostics.accessDenied = true;
      if (!res.ok) {
        sawFailure = true;
        continue;
      }

      const html = await res.text();
      if (!html.trim()) {
        sawFailure = true;
        continue;
      }

      if (detectLikelyAntiBotWall(html)) {
        sawAntiBot = true;
        console.warn("[Gemin pilot] Detekován anti-bot signál.");
        continue;
      }

      for (const pattern of patterns) {
        for (const match of html.matchAll(pattern)) {
          const href = match[1];
          const titleHtml = match[2];
          if (!href || /\/verejne-zakazky\/?$/i.test(href.replace(/\?.*$/, "")))
            continue;
          const url = new URL(href, pageUrl).toString();
          if (seenHrefs.has(url)) continue;
          seenHrefs.add(url);
          const title = stripTags(titleHtml);
          if (!title) continue;
          rows.push({ url, title });
        }
      }
    }

    diagnostics.antiBotDetected = sawAntiBot;
    diagnostics.requestFailed = sawFailure && rows.length === 0;
    diagnostics.extractedCount = rows.length;
    if (!rows.length) {
      if (sawAntiBot) diagnostics.errorCode = "anti_bot";
      else if (sawFailure || diagnostics.accessDenied)
        diagnostics.errorCode = "http_error";
      else diagnostics.errorCode = "parse_no_matches";
    }

    type Candidate = {
      url: string;
      title: string;
      slug: string;
      disciplina: string | null;
      klicova_slova: string[];
    };
    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (candidates.length >= MAX_ITEMS) break;
      const { disciplina, klicova_slova } = classify(row.title);
      if (!disciplina) continue;
      diagnostics.classifiedCount++;

      const slug =
        new URL(row.url).pathname.replace(/\/+$/, "").split("/").pop() ??
        `item-${candidates.length}`;

      candidates.push({
        url: row.url,
        title: row.title,
        slug,
        disciplina,
        klicova_slova,
      });
    }

    const publications = await mapWithConcurrency(
      candidates,
      GEMIN_DETAIL_CONCURRENCY,
      async (c) => {
        await delay(PILOT_THROTTLE_MS);
        try {
          const res = await fetchWithTimeout(
            c.url,
            {
              cache: "no-store",
              headers: {
                "User-Agent": "MOTT-monitor/1.0 (+gemin-ingestion)",
              },
            },
            FETCH_TIMEOUT_MS,
          );
          if (!res.ok) return null;
          const html = await res.text();
          return parsePublicationFromEzakDetailHtml(html);
        } catch {
          return null;
        }
      },
    );

    const items: IngestedZakazka[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const pub = publications[i];
      const pubIso = pub ? pub.toISOString() : null;
      items.push({
        id: `gemin-${c.slug}`,
        zdroj: source.sourceLabel,
        nazev: c.title,
        popis: null,
        url: c.url,
        datum_publikace: pubIso,
        datum_aktualizace: pubIso,
        termin_podani_nabidky: null,
        disciplina: c.disciplina!,
        klicova_slova: c.klicova_slova,
      });
    }

    if (diagnostics.errorCode !== "ok" && items.length > 0) {
      diagnostics.errorCode = "ok";
      diagnostics.requestFailed = false;
    }

    return {
      items,
      timingsMs: {
        pilotGeminMs: Math.round(nowMs() - startedAt),
      },
      diagnostics,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    diagnostics.requestFailed = true;
    diagnostics.timeoutCount = /aborted|timeout/i.test(msg) ? 1 : 0;
    diagnostics.httpStatus = diagnostics.httpStatus ?? lastHttpStatus;
    diagnostics.errorCode =
      diagnostics.timeoutCount > 0 ? "timeout" : "unknown_error";
    return {
      items: [],
      timingsMs: {
        pilotGeminMs: Math.round(nowMs() - startedAt),
      },
      diagnostics,
    };
  }
}
