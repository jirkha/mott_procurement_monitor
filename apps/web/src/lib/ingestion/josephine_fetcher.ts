import { detectLikelyAntiBotWall } from "./anti-bot-html";
import { classify } from "./classifier";
import { extractSubmissionDeadlineFromCzPortalPlainText } from "./cz-deadline-html";
import { decodeHtmlEntities } from "./html-decode";
import {
  fetchWithTimeout,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
} from "./perf";
import { ACTIVE_AGGREGATORS } from "./source-config";
import type { IngestedZakazka } from "./types";

const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const MAX_ITEMS = resolvePositiveInt(process.env.INGEST_PILOT_MAX_ITEMS, 120);
const PILOT_THROTTLE_MS = resolvePositiveInt(
  process.env.INGEST_PILOT_THROTTLE_MS,
  0,
);
const DETAIL_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_JOSEPHINE_DETAIL_CONCURRENCY,
  4,
);

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PilotErrorCode =
  | "ok"
  | "config_missing"
  | "http_error"
  | "timeout"
  | "parse_empty_html"
  | "parse_no_matches"
  | "anti_bot"
  | "unknown_error";

export type PilotFetcherDiagnostics = {
  errorCode: PilotErrorCode;
  httpStatus: number | null;
  timeoutCount: number;
  requestFailed: boolean;
  accessDenied: boolean;
  antiBotDetected: boolean;
  extractedCount: number;
  classifiedCount: number;
};

export type PilotSourceBatch = {
  items: IngestedZakazka[];
  timingsMs: Record<string, number>;
  diagnostics: PilotFetcherDiagnostics;
};

function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseCzDateTime(raw: string): Date | null {
  const m = raw
    .trim()
    .match(
      /^([0-3]?\d)\.([01]?\d)\.(\d{4})\s+([0-2]?\d):([0-5]\d)(?::([0-5]\d))?$/,
    );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hours = Number(m[4]);
  const minutes = Number(m[5]);
  const seconds = Number(m[6] ?? "0");
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCzDateOnly(raw: string): Date | null {
  const m = raw.trim().match(/^([0-3]?\d)\.([01]?\d)\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Datum zveřejnění / zahájení z HTML detailu JOSEPHINE (čeština). */
export function extractPublicationDateFromJosephineHtml(html: string): Date | null {
  if (!html.trim()) return null;

  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  );

  const compact = text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n");

  const patterns = [
    /Datum\s+zve\u0159ejn[e\u011b]n[i\u00ed][^:0-9]*:?\s*([0-3]?\d\.[01]?\d\.\d{4})/i,
    /Datum\s+zah[a\u00e1]jen[i\u00ed][^:0-9]*:?\s*([0-3]?\d\.[01]?\d\.\d{4})/i,
    /Zah[a\u00e1]jen[i\u00ed]\s+[r\u0159][i\u00ed]zen[i\u00ed][^:0-9]*:?\s*([0-3]?\d\.[01]?\d\.\d{4})/i,
  ];

  for (const p of patterns) {
    const m = compact.match(p);
    if (!m) continue;
    const dt =
      parseCzDateTime(`${m[1]} 12:00`) ?? parseCzDateOnly(m[1]);
    if (dt) return dt;
  }
  return null;
}

export function extractSubmissionDeadlineFromJosephineHtml(
  html: string,
): Date | null {
  if (!html.trim()) return null;

  const dlPair = /<dt[^>]*>[\s\S]*?(Lh[uů]ta\s+pro\s+pod[aá]n[ií]\s+nab[ií]d[eé]k|Lh[uů]ta\s+pro\s+doru[cč]en[ií]\s+ž[aá]dosti?\s+o\s+ú[cč]ast|Lh[uů]ta\s+pro\s+pod[aá]n[ií]\s+ž[aá]dosti?\s+o\s+ú[cč]ast)[\s\S]*?<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i.exec(
    html,
  );
  if (dlPair?.[2]) {
    const inner = stripTags(dlPair[2]);
    const dm = inner.match(
      /([0-3]?\d\.[01]?\d\.\d{4}\s+[0-2]?\d:[0-5]\d(?::[0-5]\d)?)/,
    );
    if (dm) {
      const dt = parseCzDateTime(dm[1]);
      if (dt) return dt;
    }
  }

  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|dt|dd|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  );

  const compact = text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n");

  const patterns = [
    /Lh[uů]ta\s+pro\s+pod[aá]n[ií]\s+nab[ií]d[eé]k\s*:?\s*([0-3]?\d\.[01]?\d\.\d{4}\s+[0-2]?\d:[0-5]\d(?::[0-5]\d)?)/i,
    /Lh[uů]ta\s+pro\s+doru[cč]en[ií]\s+ž[aá]dosti?\s+o\s+ú[cč]ast\s*:?\s*([0-3]?\d\.[01]?\d\.\d{4}\s+[0-2]?\d:[0-5]\d(?::[0-5]\d)?)/i,
    /Lh[uů]ta\s+pro\s+pod[aá]n[ií]\s+ž[aá]dosti?\s+o\s+ú[cč]ast\s*:?\s*([0-3]?\d\.[01]?\d\.\d{4}\s+[0-2]?\d:[0-5]\d(?::[0-5]\d)?)/i,
    /Lehota\s+na\s+predkladanie\s+pon[uú]k\s*:?\s*([0-3]?\d\.[01]?\d\.\d{4}\s+[0-2]?\d:[0-5]\d(?::[0-5]\d)?)/i,
  ];

  for (const p of patterns) {
    const m = compact.match(p);
    if (!m) continue;
    const dt = parseCzDateTime(m[1]);
    if (dt) return dt;
  }

  const generic = extractSubmissionDeadlineFromCzPortalPlainText(compact);
  if (generic) return generic;

  const terminy = /Term[íi]ny\s+a\s+lh[uů]ty[\s\S]{0,8000}/i.exec(html);
  if (terminy) {
    const slice = stripTags(terminy[0]);
    const dm = slice.match(
      /([0-3]?\d\.[01]?\d\.\d{4}\s+[0-2]?\d:[0-5]\d(?::[0-5]\d)?)/,
    );
    if (dm) {
      const dt = parseCzDateTime(dm[1]);
      if (dt) return dt;
    }
  }
  return null;
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

export async function getJosephineZakazkyWithStats(): Promise<PilotSourceBatch> {
  const source = ACTIVE_AGGREGATORS.find((s) => s.id === "josephine");
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
  const matchMap = new Map<string, RegExpMatchArray>();
  let lastHttpStatus: number | null = null;
  let sawAntiBot = false;
  let sawFailure = false;

  try {
    for (const pageUrl of urls) {
      await delay(PILOT_THROTTLE_MS);
      const res = await fetchWithTimeout(
        pageUrl,
        {
          cache: "no-store",
          headers: {
            "User-Agent": "MOTT-monitor/1.0 (+josephine-ingestion)",
          },
        },
        FETCH_TIMEOUT_MS,
      );
      lastHttpStatus = res.status;
      diagnostics.httpStatus = res.status;
      const accessDenied = res.status === 401 || res.status === 403;
      const requestFailed = !res.ok;
      if (accessDenied) diagnostics.accessDenied = true;
      if (requestFailed) {
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
        console.warn("[JOSEPHINE] Detekován anti-bot signál.");
        continue;
      }

      const patterns = [
        /<a[^>]+href="(\/(?:[a-z]{2}\/)?tender\/(\d+)\/summary)"[^>]*>([\s\S]*?)<\/a>/gi,
        /<a[^>]+href="(https?:\/\/josephine\.proebiz\.com\/(?:[a-z]{2}\/)?tender\/(\d+)\/summary)"[^>]*>([\s\S]*?)<\/a>/gi,
      ];
      for (const pattern of patterns) {
        const matched = Array.from(html.matchAll(pattern));
        for (const one of matched) {
          matchMap.set(`${one[1]}#${one[2]}`, one);
        }
      }
    }

    diagnostics.antiBotDetected = sawAntiBot;
    diagnostics.requestFailed = sawFailure && matchMap.size === 0;
    if (diagnostics.accessDenied && matchMap.size === 0) {
      diagnostics.errorCode = "http_error";
    }

    const matches = Array.from(matchMap.values());
    diagnostics.extractedCount = matches.length;
    if (!matches.length) {
      if (sawAntiBot) diagnostics.errorCode = "anti_bot";
      else if (sawFailure || diagnostics.accessDenied)
        diagnostics.errorCode = "http_error";
      else diagnostics.errorCode = "parse_no_matches";
    }

    const seen = new Set<string>();
    const baseItems: Array<{
      id: string;
      zdroj: string;
      nazev: string;
      popis: null;
      url: string;
      disciplina: IngestedZakazka["disciplina"];
      klicova_slova: string[];
    }> = [];

    for (const m of matches) {
      if (baseItems.length >= MAX_ITEMS) break;
      const relativeUrl = m[1];
      const tenderId = m[2];
      const title = stripTags(m[3]);
      if (!title) continue;
      const url = new URL(relativeUrl, source.listingUrl).toString();
      if (seen.has(url)) continue;
      seen.add(url);

      const { disciplina, klicova_slova } = classify(title);
      if (!disciplina) continue;
      diagnostics.classifiedCount++;

      baseItems.push({
        id: `josephine-${tenderId}`,
        zdroj: source.sourceLabel,
        nazev: title,
        popis: null,
        url,
        disciplina,
        klicova_slova,
      });
    }

    const detailExtracts = await mapWithConcurrency(
      baseItems,
      DETAIL_CONCURRENCY,
      async (item) => {
        await delay(PILOT_THROTTLE_MS);
        try {
          const res = await fetchWithTimeout(
            item.url,
            {
              cache: "no-store",
              headers: {
                "User-Agent": "MOTT-monitor/1.0 (+josephine-ingestion)",
              },
            },
            FETCH_TIMEOUT_MS,
          );
          if (!res.ok) return { deadline: null, publication: null };
          const html = await res.text();
          return {
            deadline: extractSubmissionDeadlineFromJosephineHtml(html),
            publication: extractPublicationDateFromJosephineHtml(html),
          };
        } catch {
          return { deadline: null, publication: null };
        }
      },
    );

    const items: IngestedZakazka[] = baseItems.map((item, idx) => {
      const { deadline, publication } = detailExtracts[idx] ?? {
        deadline: null,
        publication: null,
      };
      const pubIso = publication ? publication.toISOString() : null;
      return {
        ...item,
        datum_publikace: pubIso,
        datum_aktualizace: pubIso,
        termin_podani_nabidky: deadline ? deadline.toISOString() : null,
      };
    });

    if (diagnostics.errorCode !== "ok" && items.length > 0) {
      diagnostics.errorCode = "ok";
      diagnostics.requestFailed = false;
    }

    return {
      items,
      timingsMs: {
        josephineMs: Math.round(nowMs() - startedAt),
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
        josephineMs: Math.round(nowMs() - startedAt),
      },
      diagnostics,
    };
  }
}
