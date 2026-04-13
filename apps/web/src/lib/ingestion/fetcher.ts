import { parseString } from "xml2js";
import { promisify } from "util";
import { classify } from "./classifier";
import {
  htmlToCzPortalPlainText,
  parseDeadlineFromCzPortalHtml,
} from "./cz-deadline-html";
import {
  fetchWithTimeout,
  getOutboundLimiterSnapshot,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
  timeAsync,
} from "./perf";
import {
  HLIDAC_STATU_PROCURERS,
  NEN_PROFILE_SLUGS,
  XML_PROFILY_ZADAVATELU,
  getHlidacPrimaryXmlFallbackLabels,
  pilotSourceLabel,
} from "./source-config";
import { getEzakZakazkyWithStats } from "./ezak_fetcher";
import { getNkodZakazkyWithStats } from "./nkod_fetcher";
import { getNkodMmrAggregatesWithStats } from "./nkod_mmr_aggregate_fetcher";
import { getGeminZakazkyWithStats } from "./gemin_fetcher";
import {
  extractSubmissionDeadlineFromJosephineHtml,
  getJosephineZakazkyWithStats,
} from "./josephine_fetcher";
import { getNajdiVzZakazkyWithStats } from "./najdivz_fetcher";
import { enrichDeadlinesBySharedProcedureKey } from "./procedure-deadline-merge";
import type { IngestedZakazka } from "./types";
import { resolveXmlDetailUrl } from "./xml-detail-url";
import { extractSubmissionDeadlineFromZpc } from "./xml-profile-deadline";
import {
  detectHlidacStatuAccess,
  getHlidacStatuZakazkyWithStats,
  type HlidacStatuAccess,
  type HlidacStatuBatch,
} from "./hlidac-statu_fetcher";
import { getVvzZakazkyWithStats } from "./vvz_fetcher";

const parseXml = promisify(parseString);
const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const PHASED_FETCH =
  process.env.INGEST_PHASED_FETCH !== "0" &&
  process.env.INGEST_PHASED_FETCH !== "false";
const XML_RETRY_429_MAX = resolvePositiveInt(
  process.env.INGEST_XML_RETRY_429_MAX,
  3,
);
const XML_RETRY_429_BACKOFF_MS = resolvePositiveInt(
  process.env.INGEST_XML_RETRY_429_BACKOFF_MS,
  1500,
);
const XML_RETRY_429_JITTER_MS = resolvePositiveInt(
  process.env.INGEST_XML_RETRY_429_JITTER_MS,
  500,
);
const XML_RETRY_429_MAX_WAIT_MS = resolvePositiveInt(
  process.env.INGEST_XML_RETRY_429_MAX_WAIT_MS,
  120000,
);
const NEN_FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_NEN_FETCH_TIMEOUT_MS,
  20000,
);
const NEN_ABORT_RETRY =
  process.env.INGEST_NEN_ABORT_RETRY !== "0" &&
  process.env.INGEST_NEN_ABORT_RETRY !== "false";
const NEN_ABORT_RETRY_MAX = NEN_ABORT_RETRY
  ? resolvePositiveInt(process.env.INGEST_NEN_ABORT_RETRY_MAX, 1)
  : 0;
const NEN_ABORT_RETRY_BACKOFF_MS = resolvePositiveInt(
  process.env.INGEST_NEN_ABORT_RETRY_BACKOFF_MS,
  800,
);
const NEN_ABORT_TIMEOUT_STEP_MS = resolvePositiveInt(
  process.env.INGEST_NEN_ABORT_TIMEOUT_STEP_MS,
  10000,
);
const NEN_ABORT_TIMEOUT_MAX_MS = resolvePositiveInt(
  process.env.INGEST_NEN_ABORT_TIMEOUT_MAX_MS,
  40000,
);
const NEN_CONCURRENCY = resolvePositiveInt(process.env.INGEST_NEN_CONCURRENCY, 2);
const XML_PROFILE_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_XML_PROFILE_CONCURRENCY,
  2,
);
const XML_429_RETRY_ROUND_COOLDOWN_MS = resolvePositiveInt(
  process.env.INGEST_XML_429_RETRY_ROUND_COOLDOWN_MS,
  60000,
);
/** Při chybějící lhůtě z XML dotáhnout „Lhůta pro podání nabídek“ z veřejné karty profily.proebiz.com (vypnout: 0). */
const PROFILY_PUBLIC_DEADLINE =
  process.env.INGEST_PROFILY_PUBLIC_DEADLINE !== "0" &&
  process.env.INGEST_PROFILY_PUBLIC_DEADLINE !== "false";
const PROFILY_PUBLIC_DEADLINE_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_PROFILY_PUBLIC_DEADLINE_CONCURRENCY,
  4,
);
/** Při chybějící lhůtě z XML dotáhnout lhůtu z HTML karty zakázky na tenderarena.cz (vypnout: 0). */
const TENDERARENA_ZAKAZKA_DEADLINE =
  process.env.INGEST_TENDERARENA_ZAKAZKA_DEADLINE !== "0" &&
  process.env.INGEST_TENDERARENA_ZAKAZKA_DEADLINE !== "false";
const TENDERARENA_ZAKAZKA_DEADLINE_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_TENDERARENA_ZAKAZKA_DEADLINE_CONCURRENCY,
  4,
);
const TENDERARENA_ZAKAZKA_URL_RE =
  /https?:\/\/(?:www\.)?tenderarena\.cz\/dodavatel\/seznam-profilu-zadavatelu\/detail\/Z\d+\/zakazka\/\d+/i;
const NEN_DETAIL_URL_RE =
  /https?:\/\/nen\.nipez\.cz\/verejne-zakazky\/detail-zakazky\/[^/?#]+/i;
const EXCLUDE_BLOCKED_PROCEDURE_TYPES =
  process.env.INGEST_EXCLUDE_BLOCKED_PROCEDURE_TYPES !== "0" &&
  process.env.INGEST_EXCLUDE_BLOCKED_PROCEDURE_TYPES !== "false";
/** Doplnit chybějící lhůtu podle shodného systémového čísla (P26V…) napříč položkami (vypnout: 0). */
const PROCEDURE_DEADLINE_MERGE =
  process.env.INGEST_PROCEDURE_DEADLINE_MERGE !== "0" &&
  process.env.INGEST_PROCEDURE_DEADLINE_MERGE !== "false";

export type SourceBatch = {
  items: IngestedZakazka[];
  timingsMs: Record<string, number>;
  sourceFailures?: SourceFailure[];
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

export type SourceFailure = {
  sourceLabel: string;
  reason: string;
  /**
   * Pokud `false`, v přehledu nejsou žádné záznamy z tohoto zdroje (typicky první neúspěšný běh).
   * Výchozí `true` = v DB zůstávají dřívější data, uživatel vidí neaktualizované údaje.
   */
  staleDataVisible?: boolean;
};

function normalizeUrlForDedupe(input: string): string {
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

function normalizeText(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const BLOCKED_PROCEDURE_TEXTS = [
  "prime zadani",
  "jednaci rizeni bez uverejneni",
] as const;

export function hasBlockedProcedureType(plainText: string): boolean {
  const normalized = normalizeText(plainText);
  return BLOCKED_PROCEDURE_TEXTS.some((p) => normalized.includes(p));
}

type NenFetchOptions = {
  /** XML profily, které se v tomto běhu vynechají (primárně pokryté Hlídačem státu). */
  skipXmlSourceLabels?: ReadonlySet<string>;
};

/** Číselný/id klíč řízení z URL — slouží k slučování stejné zakázky napříč kanály se stejným portálovým ID. */
function extractStableProcedureKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const detail = path.match(
      /\/verejne-zakazky\/detail-zakazky\/([^/?#]+)/i,
    );
    if (detail?.[1]) return `nenlike:${detail[1].toLowerCase()}`;
    const tenderJosephine = path.match(/\/tender\/(\d+)\//i);
    if (tenderJosephine?.[1]) return `tender:${tenderJosephine[1]}`;
    const qId = u.searchParams.get("zakazkaId") ?? u.searchParams.get("id");
    if (qId && /^\d{5,}$/.test(qId)) return `q:${qId}`;
    return null;
  } catch {
    return null;
  }
}

function getDomain(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getDateBucket(input: string | null | undefined): string {
  if (input == null) return "";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildFallbackKey(item: IngestedZakazka): string {
  const title = normalizeText(item.nazev).split(" ").slice(0, 32).join(" ");
  const dateBucket = getDateBucket(item.datum_publikace);
  const urlDomain = getDomain(item.url);
  const stable = extractStableProcedureKeyFromUrl(item.url);
  if (stable) return `${stable}|${title}|${dateBucket}`;
  return `${title}|${dateBucket}|${urlDomain}`;
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}${month}${year}`;
}

type XmlFetchOpts = {
  label: string;
  url: string;
  idPrefix: string;
  detailUrlTemplate?: string;
  xmlBaseUrl?: string;
  isNenProfile?: boolean;
  timeoutMs: number;
  abortRetryMax: number;
  abortRetryBackoffMs: number;
  abortTimeoutStepMs: number;
  abortTimeoutMaxMs: number;
};

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  return /aborted|timeout/i.test(error.message);
}

export function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return seconds * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function waitMsFor429(response: Response, attempt: number): number {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
  if (retryAfterMs != null) {
    return Math.min(XML_RETRY_429_MAX_WAIT_MS, retryAfterMs);
  }
  const backoffMs = XML_RETRY_429_BACKOFF_MS * Math.pow(2, attempt);
  const jitterMs = Math.floor(Math.random() * (XML_RETRY_429_JITTER_MS + 1));
  return Math.min(XML_RETRY_429_MAX_WAIT_MS, backoffMs + jitterMs);
}

type XmlFetchResult = {
  items: IngestedZakazka[];
  durationMs: number;
  sourceFailure?: SourceFailure;
  failedWith429?: boolean;
};

function xml2jsList(node: unknown): unknown[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

/** Všechny `cast_zakazky` z `casti_vz` (více částí, různé tvary xml2js). */
function getCastZakazkyParts(z: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  for (const block of xml2jsList(z.casti_vz)) {
    if (!block || typeof block !== "object") continue;
    out.push(
      ...xml2jsList((block as Record<string, unknown>).cast_zakazky),
    );
  }
  return out;
}

function zpcListFromCast(cast: unknown): unknown[] {
  if (!cast || typeof cast !== "object") return [];
  return xml2jsList(
    (cast as Record<string, unknown>).zadavaci_postup_casti,
  );
}

let knownDeadlineSourceUrls = new Set<string>();
let disabledNenSlugs = new Set<string>();

/**
 * Slugy NEN profilu, které mají být v tomto běhu přeskočeny (opakované
 * timeout/chyby v posledních bězích). Nastavuje se z ingest-to-db.ts
 * na základě analýzy IngestionRun.stats.sourceFailures.
 */
export function setDisabledNenSlugs(slugs: Iterable<string>): void {
  disabledNenSlugs = new Set(slugs);
}

/**
 * Předplní sadu URL záznamů, které v DB už mají vyplněný deadline.
 * Enrichment HTML funkce pak tyto záznamy přeskočí a nebudou pro ně
 * stahovat detail — výrazná úspora při opakovaných bězích.
 */
export function setKnownDeadlineUrls(urls: Iterable<string>): void {
  knownDeadlineSourceUrls = new Set(urls);
}

function deadlineAlreadyKnown(sourceUrl: string): boolean {
  return knownDeadlineSourceUrls.has(sourceUrl);
}

/**
 * PROEBIZ někdy v XML vůbec neuvádí `lhuty_zadavaciho_postupu`, přestože je na veřejné kartě
 * profily.proebiz.com/verejne-zakazky/{id}. HTML má stejnou šablonu dt/dd jako portál JOSEPHINE.
 */
async function enrichProfilyVerejneZakazkyDeadlinesFromHtml(
  items: IngestedZakazka[],
): Promise<void> {
  if (!PROFILY_PUBLIC_DEADLINE) return;
  const need = items.filter(
    (i) =>
      !i.termin_podani_nabidky &&
      !deadlineAlreadyKnown(i.url) &&
      /https?:\/\/profily\.proebiz\.com\/verejne-zakazky\/\d+/i.test(i.url),
  );
  if (need.length === 0) return;

  await mapWithConcurrency(
    need,
    PROFILY_PUBLIC_DEADLINE_CONCURRENCY,
    async (item) => {
      try {
        const res = await fetchWithTimeout(
          item.url,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "MOTT-monitor/1.0 (+profily-public-deadline)",
            },
          },
          FETCH_TIMEOUT_MS,
        );
        if (!res.ok) return;
        const html = await res.text();
        const dt = extractSubmissionDeadlineFromJosephineHtml(html);
        if (dt && !isNaN(dt.getTime())) {
          item.termin_podani_nabidky = dt.toISOString();
        }
      } catch {
        /* ignorovat */
      }
    },
  );
}

async function enrichCzPortalDeadlinesAndFilterBlockedProcedureTypes(
  items: IngestedZakazka[],
): Promise<IngestedZakazka[]> {
  const shouldFetchDeadline = TENDERARENA_ZAKAZKA_DEADLINE;
  if (!shouldFetchDeadline && !EXCLUDE_BLOCKED_PROCEDURE_TYPES) return items;

  const need = items.filter(
    (i) =>
      (TENDERARENA_ZAKAZKA_URL_RE.test(i.url) || NEN_DETAIL_URL_RE.test(i.url)) &&
      ((!i.termin_podani_nabidky && !deadlineAlreadyKnown(i.url)) || EXCLUDE_BLOCKED_PROCEDURE_TYPES),
  );
  if (need.length === 0) return items;

  const blockedIds = new Set<string>();

  await mapWithConcurrency(
    need,
    TENDERARENA_ZAKAZKA_DEADLINE_CONCURRENCY,
    async (item) => {
      try {
        const res = await fetchWithTimeout(
          item.url,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "MOTT-monitor/1.0 (+tenderarena-zakazka-deadline)",
            },
          },
          FETCH_TIMEOUT_MS,
        );
        if (!res.ok) return;
        const html = await res.text();
        if (!item.termin_podani_nabidky && shouldFetchDeadline) {
          const dt = parseDeadlineFromCzPortalHtml(html);
          if (dt && !isNaN(dt.getTime())) {
            item.termin_podani_nabidky = dt.toISOString();
          }
        }
        if (EXCLUDE_BLOCKED_PROCEDURE_TYPES) {
          const plain = htmlToCzPortalPlainText(html);
          if (hasBlockedProcedureType(plain)) {
            blockedIds.add(item.id);
          }
        }
      } catch {
        /* ignorovat */
      }
    },
  );

  if (blockedIds.size === 0) return items;
  return items.filter((item) => !blockedIds.has(item.id));
}

export function dedupeZakazky(items: IngestedZakazka[]): IngestedZakazka[] {
  const seenNormalizedUrl = new Set<string>();
  const seenStableProcedureKey = new Set<string>();
  return items.filter((item) => {
    const normalizedUrl = normalizeUrlForDedupe(item.url);
    const stableProcedureKey = extractStableProcedureKeyFromUrl(item.url);
    if (seenNormalizedUrl.has(normalizedUrl)) return false;
    if (stableProcedureKey && seenStableProcedureKey.has(stableProcedureKey)) {
      return false;
    }
    seenNormalizedUrl.add(normalizedUrl);
    if (stableProcedureKey) seenStableProcedureKey.add(stableProcedureKey);
    return true;
  });
}

const HOST_429_CONSECUTIVE_THRESHOLD = resolvePositiveInt(
  process.env.INGEST_HOST_429_CONSECUTIVE_THRESHOLD,
  5,
);
const hostConsecutive429 = new Map<string, number>();

function parseHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function markHost429Hit(host: string): void {
  if (!host) return;
  hostConsecutive429.set(host, (hostConsecutive429.get(host) ?? 0) + 1);
}

function markHostOk(host: string): void {
  if (!host) return;
  hostConsecutive429.delete(host);
}

function isHostBlocked(host: string): boolean {
  if (!host || HOST_429_CONSECUTIVE_THRESHOLD <= 0) return false;
  return (hostConsecutive429.get(host) ?? 0) >= HOST_429_CONSECUTIVE_THRESHOLD;
}

function resetHostBlock(host: string): void {
  if (host) hostConsecutive429.delete(host);
}

/**
 * Stáhne a zparsuje XML export profilu zadavatele (standard dle vyhlášky č. 345/2023 Sb.).
 * Funguje shodně pro NEN, PROEBIZ i eGORDION — liší se jen URL a prefix ID.
 */
async function fetchXmlProfilZakazky(
  opts: XmlFetchOpts,
  dateFrom: Date,
): Promise<XmlFetchResult> {
  const startedAt = nowMs();
  const host = parseHostFromUrl(opts.url);

  if (isHostBlocked(host)) {
    console.warn(`[${opts.label}] Host ${host} blokován (opakované 429) — přeskočen.`);
    return {
      items: [],
      durationMs: Math.round(nowMs() - startedAt),
      failedWith429: true,
      sourceFailure: {
        sourceLabel: opts.label,
        reason: `Host ${host} blokován po ${HOST_429_CONSECUTIVE_THRESHOLD}× po sobě jdoucích HTTP 429.`,
      },
    };
  }

  try {
    let res: Response | null = null;
    let abortRetryCount = 0;
    let timeoutMsForAttempt = opts.timeoutMs;
    for (let attempt = 0; attempt <= XML_RETRY_429_MAX; attempt++) {
      try {
        res = await fetchWithTimeout(
          opts.url,
          { cache: "no-store" },
          timeoutMsForAttempt,
        );
      } catch (error: unknown) {
        if (isAbortError(error) && abortRetryCount < opts.abortRetryMax) {
          abortRetryCount++;
          timeoutMsForAttempt = Math.min(
            opts.abortTimeoutMaxMs,
            opts.timeoutMs + opts.abortTimeoutStepMs * abortRetryCount,
          );
          await sleep(opts.abortRetryBackoffMs * abortRetryCount);
          continue;
        }
        throw error;
      }
      if (res.status !== 429 || attempt === XML_RETRY_429_MAX) break;
      const waitMs = waitMsFor429(res, attempt);
      await sleep(waitMs);
    }

    if (!res) {
      return {
        items: [],
        durationMs: Math.round(nowMs() - startedAt),
        sourceFailure: {
          sourceLabel: opts.label,
          reason: "Neznámá chyba při stahování XML.",
        },
      };
    }

    if (!res.ok) {
      const is429 = res.status === 429;
      if (is429) markHost429Hit(host);
      console.warn(`[${opts.label}] HTTP ${res.status} — export přeskočen.`);
      return {
        items: [],
        durationMs: Math.round(nowMs() - startedAt),
        failedWith429: is429,
        sourceFailure: {
          sourceLabel: opts.label,
          reason: `HTTP ${res.status}`,
        },
      };
    }

    markHostOk(host);

    let xmlText = await res.text();
    xmlText = xmlText.replace(/^\uFEFF/, "").trimStart();

    if (!xmlText.startsWith("<?xml") && !xmlText.startsWith("<profil")) {
      const redirectMatch =
        /href="(https:\/\/api\.tenderarena\.cz[^"]+)"/i.exec(xmlText) ||
        /The document has moved <a href="([^"]+)"/i.exec(xmlText);
      if (redirectMatch?.[1]) {
        const nextUrl = redirectMatch[1].replace(/&amp;/g, "&");
        const res2 = await fetchWithTimeout(
          nextUrl,
          { cache: "no-store" },
          opts.timeoutMs,
        );
        if (res2.ok) {
          xmlText = (await res2.text()).replace(/^\uFEFF/, "").trimStart();
        }
      }
    }

    if (!xmlText.startsWith("<?xml") && !xmlText.startsWith("<profil")) {
      const hint =
        xmlText.includes("neexistuje") || xmlText.includes("Neexistuje")
          ? " (profil v URL pravděpodobně neodpovídá přesnému kódu)"
          : "";
      console.warn(
        `[${opts.label}] Neplatná nebo prázdná odpověď exportu XML — přeskočeno.${hint}`,
      );
      return {
        items: [],
        durationMs: Math.round(nowMs() - startedAt),
        sourceFailure: {
          sourceLabel: opts.label,
          reason: "Neplatná nebo prázdná odpověď XML.",
        },
      };
    }

    const result = (await parseXml(xmlText)) as {
      profil?: { zakazka?: unknown[] };
    };
    const zakazky = result?.profil?.zakazka || [];

    let processedZakazky: IngestedZakazka[] = [];

    for (const z of zakazky as Array<Record<string, unknown[]>>) {
      const idObjektu = String(z.id_objektu?.[0] ?? "");
      const nazev = String(z.nazev_vz?.[0] ?? "");
      const popis = String(z.predmet_vz?.[0] ?? "");
      const linkId = idObjektu.replace(/\//g, "-");

      const link = resolveXmlDetailUrl(
        z as Record<string, unknown[]>,
        opts,
        linkId,
      );

      const castParts = getCastZakazkyParts(z as Record<string, unknown>);
      let deadlineDt: Date | null = null;
      let datumStr: string | null = null;
      const pubDatesForUpdated: Date[] = [];

      for (const cast of castParts) {
        for (const zpc of zpcListFromCast(cast)) {
          const zpcRec = zpc as Record<string, unknown[]>;
          const rawPub = zpcRec?.datum_uverejneni?.[0];
          if (datumStr == null && rawPub != null) {
            datumStr = String(rawPub);
          }
          if (rawPub != null) {
            const pd = new Date(String(rawPub));
            if (!isNaN(pd.getTime())) pubDatesForUpdated.push(pd);
          }
          const dline = extractSubmissionDeadlineFromZpc(zpc);
          if (
            dline &&
            (!deadlineDt || dline.getTime() < deadlineDt.getTime())
          ) {
            deadlineDt = dline;
          }
          const docList = (
            zpcRec?.dokumenty?.[0] as Record<string, unknown[]> | undefined
          )?.dokument as unknown[] | undefined;
          if (Array.isArray(docList)) {
            for (const doc of docList) {
              const d = doc as Record<string, string[]>;
              const cas = d.cas_vlozeni_na_profil?.[0];
              if (cas) {
                const docDate = new Date(cas);
                if (!isNaN(docDate.getTime())) {
                  pubDatesForUpdated.push(docDate);
                }
              }
            }
          }
        }
      }

      const pubParsed =
        datumStr != null ? new Date(datumStr) : new Date(NaN);
      const pubValid = !isNaN(pubParsed.getTime());
      const pubIso = pubValid ? pubParsed.toISOString() : null;

      let recordUpdated: Date | null = null;
      for (const t of pubDatesForUpdated) {
        if (!recordUpdated || t > recordUpdated) recordUpdated = t;
      }
      if (pubValid) {
        if (!recordUpdated || pubParsed > recordUpdated) {
          recordUpdated = pubParsed;
        }
      }

      const windowAnchor = recordUpdated;
      if (windowAnchor != null && windowAnchor < dateFrom) continue;

      const { disciplina, klicova_slova } = classify(`${nazev} ${popis}`);
      if (!disciplina) continue;

      processedZakazky.push({
        id: `${opts.idPrefix}-${linkId || "unknown"}`,
        zdroj: opts.label,
        nazev,
        popis: popis.substring(0, 500) || null,
        url: link,
        datum_publikace: pubIso,
        datum_aktualizace: recordUpdated ? recordUpdated.toISOString() : null,
        termin_podani_nabidky: deadlineDt ? deadlineDt.toISOString() : null,
        disciplina,
        klicova_slova,
      });
    }

    await enrichProfilyVerejneZakazkyDeadlinesFromHtml(processedZakazky);
    processedZakazky =
      await enrichCzPortalDeadlinesAndFilterBlockedProcedureTypes(
        processedZakazky,
      );

    return {
      items: processedZakazky,
      durationMs: Math.round(nowMs() - startedAt),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[${opts.label}] Chyba stahování: ${msg}`);
    const timeoutReason = isAbortError(error)
      ? `Timeout (abort) po ${opts.timeoutMs} ms, retries vycerpany.`
      : "Chyba stahování.";
    return {
      items: [],
      durationMs: Math.round(nowMs() - startedAt),
      sourceFailure: {
        sourceLabel: opts.label,
        reason: timeoutReason,
      },
    };
  }
}

function buildDateRange() {
  const lookbackMonths = resolvePositiveInt(
    process.env.INGEST_LOOKBACK_MONTHS,
    12,
  );
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - lookbackMonths);
  const minDate = new Date("2024-07-01");
  if (dateFrom < minDate) dateFrom.setTime(minDate.getTime());
  return { dateFrom, dateTo };
}

export async function getNenZakazkyWithStats(
  opts?: NenFetchOptions,
): Promise<SourceBatch> {
  const { dateFrom, dateTo } = buildDateRange();
  const odDo = `?od=${formatDate(dateFrom)}&do=${formatDate(dateTo)}`;
  const skipXmlSourceLabels = opts?.skipXmlSourceLabels ?? new Set<string>();

  const skippedSlugs: SourceFailure[] = [];
  const activeSlugs = NEN_PROFILE_SLUGS.filter((slug) => {
    if (disabledNenSlugs.has(slug)) {
      console.warn(`[NEN – ${slug}] Dočasně deaktivován (opakované selhání) — přeskočen.`);
      skippedSlugs.push({
        sourceLabel: `NEN – ${slug}`,
        reason: "Dočasně deaktivován (opakované timeout/chyby v posledních bězích).",
      });
      return false;
    }
    return true;
  });

  const nenJobs = activeSlugs.map((slug) => ({
    label: `NEN – ${slug}`,
    url: `https://nen.nipez.cz/profil/${slug}/XMLdataVZ${odDo}`,
    idPrefix: `nen-${slug.toLowerCase()}`,
    detailUrlTemplate: undefined,
    xmlBaseUrl: `https://nen.nipez.cz/profil/${slug}/XMLdataVZ`,
    isNenProfile: true,
    timeoutMs: NEN_FETCH_TIMEOUT_MS,
    abortRetryMax: NEN_ABORT_RETRY_MAX,
    abortRetryBackoffMs: NEN_ABORT_RETRY_BACKOFF_MS,
    abortTimeoutStepMs: NEN_ABORT_TIMEOUT_STEP_MS,
    abortTimeoutMaxMs: NEN_ABORT_TIMEOUT_MAX_MS,
  }));

  const skippedXmlByHsPrimary: SourceFailure[] = [];
  const genericJobs: XmlFetchOpts[] = [];
  for (const p of XML_PROFILY_ZADAVATELU) {
    if (skipXmlSourceLabels.has(p.name)) {
      skippedXmlByHsPrimary.push({
        sourceLabel: p.name,
        reason: "Přeskočeno: primární zdroj je Hlídač státu (VZ API dostupné), XML profil ponechán jen jako fallback.",
      });
      continue;
    }
    genericJobs.push({
      label: p.name,
      url: `${p.xmlBaseUrl}${odDo}`,
      idPrefix: p.idPrefix,
      detailUrlTemplate: p.detailUrlTemplate,
      xmlBaseUrl: p.xmlBaseUrl,
      isNenProfile: false,
      timeoutMs: FETCH_TIMEOUT_MS,
      abortRetryMax: 0,
      abortRetryBackoffMs: XML_RETRY_429_BACKOFF_MS,
      abortTimeoutStepMs: 0,
      abortTimeoutMaxMs: FETCH_TIMEOUT_MS,
    });
  }

  const genericJobsByHost = new Map<string, XmlFetchOpts[]>();
  for (const j of genericJobs) {
    const host = new URL(j.url).hostname.toLowerCase();
    const bucket = genericJobsByHost.get(host) ?? [];
    bucket.push(j);
    genericJobsByHost.set(host, bucket);
  }

  for (const bucket of genericJobsByHost.values()) {
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
  }

  type LabeledResult = XmlFetchResult & { label: string };

  const runGenericJobs = async (): Promise<LabeledResult[]> => {
    const bucketResults = await Promise.all(
      Array.from(genericJobsByHost.values()).map((jobs) =>
        mapWithConcurrency(jobs, 1, async (j) => {
          const result = await fetchXmlProfilZakazky(j, dateFrom);
          return { ...result, label: j.label } as LabeledResult;
        }),
      ),
    );
    const firstPassResults = bucketResults.flat();

    const retryJobs: XmlFetchOpts[] = [];
    const retryHosts = new Set<string>();
    for (const r of firstPassResults) {
      if (!r.failedWith429) continue;
      const job = genericJobs.find((j) => j.label === r.label);
      if (job) {
        retryJobs.push(job);
        retryHosts.add(parseHostFromUrl(job.url));
      }
    }

    if (retryJobs.length === 0) return firstPassResults;

    console.log(
      `[ingest] Retry round: ${retryJobs.length} profilů selhalo s 429, ` +
      `cooldown ${Math.round(XML_429_RETRY_ROUND_COOLDOWN_MS / 1000)}s…`,
    );
    await sleep(XML_429_RETRY_ROUND_COOLDOWN_MS);

    for (const host of retryHosts) resetHostBlock(host);

    const retryByHost = new Map<string, XmlFetchOpts[]>();
    for (const j of retryJobs) {
      const host = parseHostFromUrl(j.url);
      const bucket = retryByHost.get(host) ?? [];
      bucket.push(j);
      retryByHost.set(host, bucket);
    }

    const retryBucketResults = await Promise.all(
      Array.from(retryByHost.values()).map((jobs) =>
        mapWithConcurrency(jobs, 1, async (j) => {
          const result = await fetchXmlProfilZakazky(j, dateFrom);
          return { ...result, label: j.label } as LabeledResult;
        }),
      ),
    );
    const retryResults = retryBucketResults.flat();

    const retryLabels = new Set(retryResults.map((r) => r.label));
    const kept = firstPassResults.filter((r) => !retryLabels.has(r.label));
    return [...kept, ...retryResults];
  };

  const [nenResults, genericResults] = await Promise.all([
    mapWithConcurrency(nenJobs, NEN_CONCURRENCY, async (j) => {
      const result = await fetchXmlProfilZakazky(j, dateFrom);
      return { ...result, label: j.label };
    }),
    runGenericJobs(),
  ]);
  const results = [...nenResults, ...genericResults];

  const timingsMs: Record<string, number> = {};
  for (const r of results) {
    timingsMs[`nen:${r.label}`] = r.durationMs;
  }
  const sourceFailures = [
    ...skippedSlugs,
    ...skippedXmlByHsPrimary,
    ...results
      .map((r) => r.sourceFailure)
      .filter((f): f is SourceFailure => f != null),
  ];

  return {
    items: results.flatMap((r) => r.items),
    timingsMs,
    sourceFailures,
  };
}

export async function getNenZakazky(): Promise<IngestedZakazka[]> {
  const { items } = await getNenZakazkyWithStats();
  return items;
}

/** Sloučí zakázky ze všech zdrojů, odstraní duplicity dle URL a seřadí. */
export async function getAllZakazkyWithStats(): Promise<SourceBatch> {
  const timingsMs: Record<string, number> = {};
  let nen: SourceBatch;
  let ezak: Awaited<ReturnType<typeof getEzakZakazkyWithStats>>;
  let vvz: Awaited<ReturnType<typeof getVvzZakazkyWithStats>>;
  let nkod: Awaited<ReturnType<typeof getNkodZakazkyWithStats>>;
  let nkodMmr: Awaited<ReturnType<typeof getNkodMmrAggregatesWithStats>>;
  let josephine: Awaited<ReturnType<typeof getJosephineZakazkyWithStats>>;
  let najdivz: Awaited<ReturnType<typeof getNajdiVzZakazkyWithStats>>;
  let gemin: Awaited<ReturnType<typeof getGeminZakazkyWithStats>>;
  let hlidacStatu: HlidacStatuBatch;

  const { dateFrom: hlidacDateFrom } = buildDateRange();
  const hlidacAccess: HlidacStatuAccess = await detectHlidacStatuAccess();
  const hsPreferredXmlLabels =
    hlidacAccess.status === "ok"
      ? new Set(getHlidacPrimaryXmlFallbackLabels())
      : new Set<string>();

  const fetchHlidacStatu = () =>
    timeAsync("fetchHlidacStatuTotalMs", timingsMs, () =>
      getHlidacStatuZakazkyWithStats(
        HLIDAC_STATU_PROCURERS,
        hlidacDateFrom,
        hlidacAccess,
      ),
    );

  if (PHASED_FETCH) {
    nen = await timeAsync("fetchNenTotalMs", timingsMs, () =>
      getNenZakazkyWithStats({ skipXmlSourceLabels: hsPreferredXmlLabels }),
    );
    [ezak, vvz, nkod, nkodMmr, josephine, hlidacStatu] = await Promise.all([
      timeAsync("fetchEzakTotalMs", timingsMs, getEzakZakazkyWithStats),
      timeAsync("fetchVvzTotalMs", timingsMs, getVvzZakazkyWithStats),
      timeAsync("fetchNkodTotalMs", timingsMs, getNkodZakazkyWithStats),
      timeAsync(
        "fetchNkodMmrAggregateTotalMs",
        timingsMs,
        getNkodMmrAggregatesWithStats,
      ),
      timeAsync("fetchJosephineTotalMs", timingsMs, getJosephineZakazkyWithStats),
      fetchHlidacStatu(),
    ]);
    [najdivz, gemin] = await Promise.all([
      timeAsync("fetchPilotNajdivzTotalMs", timingsMs, getNajdiVzZakazkyWithStats),
      timeAsync("fetchPilotGeminTotalMs", timingsMs, getGeminZakazkyWithStats),
    ]);
  } else {
    [nen, ezak, vvz, nkod, nkodMmr, josephine, najdivz, gemin, hlidacStatu] =
      await Promise.all([
        timeAsync("fetchNenTotalMs", timingsMs, () =>
          getNenZakazkyWithStats({ skipXmlSourceLabels: hsPreferredXmlLabels }),
        ),
        timeAsync("fetchEzakTotalMs", timingsMs, getEzakZakazkyWithStats),
        timeAsync("fetchVvzTotalMs", timingsMs, getVvzZakazkyWithStats),
        timeAsync("fetchNkodTotalMs", timingsMs, getNkodZakazkyWithStats),
        timeAsync(
          "fetchNkodMmrAggregateTotalMs",
          timingsMs,
          getNkodMmrAggregatesWithStats,
        ),
        timeAsync(
          "fetchJosephineTotalMs",
          timingsMs,
          getJosephineZakazkyWithStats,
        ),
        timeAsync(
          "fetchPilotNajdivzTotalMs",
          timingsMs,
          getNajdiVzZakazkyWithStats,
        ),
        timeAsync("fetchPilotGeminTotalMs", timingsMs, getGeminZakazkyWithStats),
        fetchHlidacStatu(),
      ]);
  }

  const baseItems = [
    ...nen.items,
    ...ezak.items,
    ...vvz.items,
    ...nkod.items,
    ...josephine.items,
    ...hlidacStatu.items,
  ];
  const pilotItems = [...najdivz.items, ...gemin.items];
  const all = [...baseItems, ...pilotItems];
  if (PROCEDURE_DEADLINE_MERGE) {
    enrichDeadlinesBySharedProcedureKey(all);
  }
  const mergeStartedAt = nowMs();

  const baseUrlKeys = new Set(baseItems.map((i) => normalizeUrlForDedupe(i.url)));
  const baseFallbackKeys = new Set(baseItems.map((i) => buildFallbackKey(i)));

  const pilotAggregators = [
    { sourceId: "najdivz", sourceLabel: pilotSourceLabel("najdivz"), batch: najdivz },
    { sourceId: "gemin", sourceLabel: pilotSourceLabel("gemin"), batch: gemin },
  ].map((pilotSource) => {
    let duplicateVsExistingCount = 0;
    let uniqueVsExistingCount = 0;
    let dedupeByUrlCount = 0;
    let dedupeByFallbackCount = 0;
    for (const item of pilotSource.batch.items) {
      const byUrl = baseUrlKeys.has(normalizeUrlForDedupe(item.url));
      const byFallback = baseFallbackKeys.has(buildFallbackKey(item));
      if (byUrl || byFallback) {
        duplicateVsExistingCount++;
        if (byUrl) dedupeByUrlCount++;
        else dedupeByFallbackCount++;
      }
      else uniqueVsExistingCount++;
    }

    const stability = pilotSource.batch.diagnostics;
    const unstable =
      stability.requestFailed ||
      stability.accessDenied ||
      stability.antiBotDetected ||
      stability.timeoutCount > 0 ||
      (stability.httpStatus != null && stability.httpStatus >= 500);
    const goDecision: "go" | "no-go" =
      uniqueVsExistingCount > 0 && !unstable ? "go" : "no-go";
    const reason =
      goDecision === "go"
        ? "Má unikátní záznamy a technicky stabilní přístup."
        : uniqueVsExistingCount <= 0
          ? "Bez prokazatelně unikátních záznamů vůči existujícím zdrojům."
          : "Technické riziko (anti-bot/timeout/access) je příliš vysoké.";

    return {
      sourceId: pilotSource.sourceId,
      sourceLabel: pilotSource.sourceLabel,
      downloadedCount: pilotSource.batch.items.length,
      extractedCount: pilotSource.batch.diagnostics.extractedCount,
      classifiedRatio:
        pilotSource.batch.diagnostics.extractedCount > 0
          ? Number(
              (
                pilotSource.batch.diagnostics.classifiedCount /
                pilotSource.batch.diagnostics.extractedCount
              ).toFixed(4),
            )
          : 0,
      uniqueVsExistingCount,
      duplicateVsExistingCount,
      dedupeByUrlCount,
      dedupeByFallbackCount,
      goDecision,
      reason,
      stability,
    };
  });

  const sourceFailures: SourceFailure[] = [
    ...(nen.sourceFailures ?? []),
    ...hlidacStatu.sourceFailures,
  ];
  const josephineStability = josephine.diagnostics;
  if (
    josephineStability.requestFailed ||
    josephineStability.accessDenied ||
    josephineStability.antiBotDetected ||
    josephineStability.timeoutCount > 0
  ) {
    const reason = josephineStability.antiBotDetected
      ? "Anti-bot detekce."
      : josephineStability.accessDenied
        ? "Přístup zamítnut (401/403)."
        : josephineStability.timeoutCount > 0
          ? "Timeout."
          : josephineStability.httpStatus != null
            ? `HTTP ${josephineStability.httpStatus}`
            : "Požadavek selhal.";
    sourceFailures.push({
      sourceLabel: "JOSEPHINE",
      reason,
    });
  }
  for (const p of pilotAggregators) {
    const s = p.stability;
    if (!s.requestFailed && !s.accessDenied && !s.antiBotDetected && s.timeoutCount <= 0) {
      continue;
    }
    const reason = s.antiBotDetected
      ? "Anti-bot detekce."
      : s.accessDenied
        ? "Přístup zamítnut (401/403)."
        : s.timeoutCount > 0
          ? "Timeout."
          : s.httpStatus != null
            ? `HTTP ${s.httpStatus}`
            : "Požadavek selhal.";
    sourceFailures.push({
      sourceLabel: p.sourceLabel,
      reason,
    });
  }

  const unique = dedupeZakazky(all);

  function sortTs(x: IngestedZakazka): number {
    const a = x.datum_aktualizace ?? x.datum_publikace;
    if (!a) return 0;
    const t = new Date(a).getTime();
    return isNaN(t) ? 0 : t;
  }
  unique.sort((a, b) => sortTs(b) - sortTs(a));

  timingsMs.mergeAndSortMs = Math.round(nowMs() - mergeStartedAt);
  const outboundSnapshot = getOutboundLimiterSnapshot();
  timingsMs.outboundRequests = outboundSnapshot.totals.requests;
  timingsMs.outbound429 = outboundSnapshot.totals.status429;
  timingsMs.outboundTimeouts = outboundSnapshot.totals.timeouts;
  timingsMs.outboundCooldownWaitMs = outboundSnapshot.totals.cooldownWaitMs;
  for (const row of outboundSnapshot.perHost) {
    const hostKey = row.host.replace(/[^a-z0-9.-]+/gi, "_").toLowerCase();
    timingsMs[`outbound429:${hostKey}`] = row.status429;
    timingsMs[`outboundTimeout:${hostKey}`] = row.timeouts;
    timingsMs[`outboundRequests:${hostKey}`] = row.requests;
    timingsMs[`outboundCooldownWaitMs:${hostKey}`] = row.cooldownWaitMs;
  }
  const proxyCandidates = outboundSnapshot.perHost
    .filter((row) => row.proxyCandidate)
    .map((row) => {
      const ratio = row.requests > 0 ? row.status429 / row.requests : 0;
      return {
        host: row.host,
        reason: `429 ratio ${ratio.toFixed(3)} (429 ${row.status429}/${row.requests}).`,
      };
    });
  for (const candidate of proxyCandidates) {
    sourceFailures.push({
      sourceLabel: `Proxy pilot kandidat: ${candidate.host}`,
      reason: candidate.reason,
    });
  }

  return {
    items: unique,
    timingsMs: {
      ...timingsMs,
      ...nen.timingsMs,
      ...ezak.timingsMs,
      ...vvz.timingsMs,
      ...nkod.timingsMs,
      ...nkodMmr.timingsMs,
      ...josephine.timingsMs,
      ...najdivz.timingsMs,
      ...gemin.timingsMs,
      ...hlidacStatu.timingsMs,
    },
    analytics: {
      nkodMmrAggregates: nkodMmr.snapshots,
      pilotAggregators,
      outboundLimiter: {
        totals: outboundSnapshot.totals,
        hosts: outboundSnapshot.perHost,
        proxyCandidates,
      },
    },
    sourceFailures,
  };
}

export async function getAllZakazky(): Promise<IngestedZakazka[]> {
  const { items } = await getAllZakazkyWithStats();
  return items;
}
