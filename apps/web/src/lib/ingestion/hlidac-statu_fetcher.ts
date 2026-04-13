import { classify } from "./classifier";
import {
  fetchWithTimeout,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
} from "./perf";
import type { HlidacStatuIcoProcurer } from "./source-config";
import type { IngestedZakazka } from "./types";
import type { SourceFailure } from "./fetcher";

const API_TOKEN = process.env.HLIDAC_STATU_API_TOKEN ?? "";
const API_BASE = "https://api.hlidacstatu.cz/api/v2";
const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_HLIDAC_FETCH_TIMEOUT_MS,
  12000,
);
const CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_HLIDAC_CONCURRENCY,
  2,
);
const MAX_PAGES = resolvePositiveInt(
  process.env.INGEST_HLIDAC_MAX_PAGES,
  5,
);
const PAGE_SIZE = 50;
const RETRY_MAX = 2;
const RETRY_BACKOFF_MS = 3000;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
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

type HsSubject = {
  ico?: string;
  jmeno?: string;
  profilZadavatele?: string;
};

type HsVerejnaZakazka = {
  id?: string;
  nazevZakazky?: string;
  popisZakazky?: string;
  datumUverejneni?: string | null;
  lhutaDoruceni?: string | null;
  posledniZmena?: string | null;
  zadavatel?: HsSubject;
  urlZakazky?: string[];
  stavVZ?: number;
};

type HsSearchResponse = {
  total?: number;
  page?: number;
  results?: HsVerejnaZakazka[];
};

export type HlidacStatuAccessStatus =
  | "ok"
  | "missing_token"
  | "token_invalid"
  | "vz_forbidden"
  | "unknown";

export type HlidacStatuAccess = {
  status: HlidacStatuAccessStatus;
  reason?: string;
};

function hsDetailUrl(id: string): string {
  return `https://www.hlidacstatu.cz/verejnezakazky/zakazka/${encodeURIComponent(id)}`;
}

function pickBestUrl(vz: HsVerejnaZakazka): string {
  if (Array.isArray(vz.urlZakazky) && vz.urlZakazky.length > 0) {
    const nen = vz.urlZakazky.find((u) =>
      /nen\.nipez\.cz|vvz\.nipez\.cz/i.test(u),
    );
    if (nen) return nen;
    return vz.urlZakazky[0];
  }
  return vz.id ? hsDetailUrl(vz.id) : "";
}

function toIso(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function mapToIngested(
  vz: HsVerejnaZakazka,
  procurerName: string,
): IngestedZakazka | null {
  if (!vz.nazevZakazky && !vz.id) return null;
  const url = pickBestUrl(vz);
  if (!url) return null;

  const title = vz.nazevZakazky ?? "(bez názvu)";
  const description = vz.popisZakazky ?? null;
  const result = classify(`${title} ${description ?? ""}`);

  return {
    id: `hs-${vz.id ?? "unknown"}`,
    zdroj: `Hlídač státu – ${procurerName}`,
    nazev: title,
    popis: description,
    url,
    datum_publikace: toIso(vz.datumUverejneni),
    datum_aktualizace: toIso(vz.posledniZmena),
    termin_podani_nabidky: toIso(vz.lhutaDoruceni),
    disciplina: result.disciplina,
    klicova_slova: result.klicova_slova,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function classifyHttpError(status: number): string {
  if (status === 401)
    return "Přístup zamítnut (HTTP 401) — neplatný nebo expirovaný API token. Obnovte na https://www.hlidacstatu.cz/api";
  if (status === 403)
    return "Přístup zamítnut (HTTP 403) — token je platný, ale bez oprávnění k API veřejných zakázek (vyžaduje odpovídající licenci).";
  if (status === 429)
    return "Rate limit Hlídače státu (HTTP 429) — zkuste později nebo snižte INGEST_HLIDAC_CONCURRENCY.";
  if (status >= 500)
    return `Server Hlídače státu vrátil chybu (HTTP ${status}).`;
  return `HTTP ${status}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Token ${API_TOKEN}`,
    Accept: "application/json",
  };
}

function buildVzSearchUrl(query: string, page: number): string {
  return `${API_BASE}/verejnezakazky/hledat?dotaz=${encodeURIComponent(query)}&strana=${page}&razeni=1`;
}

function classifyAccessStatusMessage(status: HlidacStatuAccessStatus): string {
  if (status === "missing_token") {
    return "Chybí HLIDAC_STATU_API_TOKEN.";
  }
  if (status === "token_invalid") {
    return "API token Hlídače státu je neplatný nebo expirovaný (401/403 na /api/v2/check).";
  }
  if (status === "vz_forbidden") {
    return "Token je platný, ale nemá oprávnění pro endpoint veřejných zakázek (/api/v2/verejnezakazky/hledat vrací 403).";
  }
  if (status === "unknown") {
    return "Nepodařilo se jednoznačně ověřit oprávnění Hlídače státu (dočasná síťová/HTTP chyba).";
  }
  return "OK";
}

export async function detectHlidacStatuAccess(): Promise<HlidacStatuAccess> {
  if (!API_TOKEN) {
    return { status: "missing_token", reason: classifyAccessStatusMessage("missing_token") };
  }

  try {
    const checkRes = await fetchWithTimeout(
      `${API_BASE}/check`,
      {
        headers: authHeaders(),
        cache: "no-store",
      },
      FETCH_TIMEOUT_MS,
    );

    if (checkRes.status === 401 || checkRes.status === 403) {
      return {
        status: "token_invalid",
        reason: classifyAccessStatusMessage("token_invalid"),
      };
    }
    if (!checkRes.ok) {
      return {
        status: "unknown",
        reason: `Endpoint /api/v2/check vrátil HTTP ${checkRes.status}.`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "unknown",
      reason: `Volání /api/v2/check selhalo: ${msg}`,
    };
  }

  try {
    const vzRes = await fetchWithTimeout(
      buildVzSearchUrl("test", 1),
      {
        headers: authHeaders(),
        cache: "no-store",
      },
      FETCH_TIMEOUT_MS,
    );
    if (vzRes.status === 401) {
      return {
        status: "token_invalid",
        reason: classifyAccessStatusMessage("token_invalid"),
      };
    }
    if (vzRes.status === 403) {
      return {
        status: "vz_forbidden",
        reason: classifyAccessStatusMessage("vz_forbidden"),
      };
    }
    if (!vzRes.ok) {
      return {
        status: "unknown",
        reason: `Endpoint /api/v2/verejnezakazky/hledat vrátil HTTP ${vzRes.status}.`,
      };
    }
    return { status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "unknown",
      reason: `Volání /api/v2/verejnezakazky/hledat selhalo: ${msg}`,
    };
  }
}

async function fetchPage(
  query: string,
  page: number,
): Promise<{ data: HsSearchResponse | null; httpStatus: number | null; error?: string }> {
  const url = buildVzSearchUrl(query, page);

  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: authHeaders(),
          cache: "no-store",
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < RETRY_MAX) {
          const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"));
          const waitMs = retryAfter ?? RETRY_BACKOFF_MS * Math.pow(2, attempt);
          await sleep(Math.min(waitMs, 60000));
          continue;
        }
        const body = await res.text().catch(() => "");
        return {
          data: null,
          httpStatus: res.status,
          error: classifyHttpError(res.status) + (body ? ` (${body.slice(0, 120)})` : ""),
        };
      }

      const json = (await res.json()) as HsSearchResponse;
      return { data: json, httpStatus: res.status };
    } catch (err) {
      if (attempt < RETRY_MAX) {
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { data: null, httpStatus: null, error: msg };
    }
  }

  return { data: null, httpStatus: null, error: "Vyčerpány retry pokusy." };
}

async function fetchIcoAll(
  procurer: HlidacStatuIcoProcurer,
  dateFrom: Date | null,
): Promise<{ items: IngestedZakazka[]; failure?: SourceFailure }> {
  let query = `icozadavatel:${procurer.ico}`;
  if (dateFrom) {
    const from = dateFrom.toISOString().slice(0, 10);
    query += ` AND zverejneno:[${from} TO *]`;
  }

  const allItems: IngestedZakazka[] = [];
  let page = 1;
  let totalSoFar = 0;

  while (page <= MAX_PAGES) {
    const { data, httpStatus, error } = await fetchPage(query, page);
    if (!data) {
      if (page === 1) {
        return {
          items: [],
          failure: {
            sourceLabel: `Hlídač státu – ${procurer.name}`,
            reason: error ?? `HTTP ${httpStatus}`,
          },
        };
      }
      break;
    }

    const results = data.results ?? [];
    for (const vz of results) {
      const item = mapToIngested(vz, procurer.name);
      if (item) allItems.push(item);
    }
    totalSoFar += results.length;

    const total = data.total ?? 0;
    if (totalSoFar >= total || results.length < PAGE_SIZE) break;
    page++;
  }

  return { items: allItems };
}

export type HlidacStatuBatch = {
  items: IngestedZakazka[];
  timingsMs: Record<string, number>;
  sourceFailures: SourceFailure[];
  access: HlidacStatuAccess;
};

export async function getHlidacStatuZakazkyWithStats(
  procurers: readonly HlidacStatuIcoProcurer[],
  dateFrom: Date | null,
  accessOverride?: HlidacStatuAccess,
): Promise<HlidacStatuBatch> {
  const timingsMs: Record<string, number> = {};
  const access = accessOverride ?? (await detectHlidacStatuAccess());

  if (access.status === "missing_token") {
    console.warn(
      `[Hlídač státu] ${classifyAccessStatusMessage("missing_token")}`,
    );
    return { items: [], timingsMs: { hlidacStatuSkipped: 0 }, sourceFailures: [], access };
  }

  if (procurers.length === 0) {
    console.warn("[Hlídač státu] Prázdný seznam zadavatelů (HLIDAC_STATU_PROCURERS) — přeskočeno.");
    return { items: [], timingsMs: { hlidacStatuEmpty: 0 }, sourceFailures: [], access };
  }

  const startedAt = nowMs();
  if (access.status === "token_invalid" || access.status === "vz_forbidden") {
    const reason = access.reason ?? classifyAccessStatusMessage(access.status);
    console.warn(`[Hlídač státu] ${reason}`);
    return {
      items: [],
      timingsMs: {
        [access.status === "token_invalid" ? "hlidacStatuTokenInvalid" : "hlidacStatuVzForbidden"]:
          Math.round(nowMs() - startedAt),
      },
      sourceFailures: [{
        sourceLabel: "Hlídač státu",
        reason,
      }],
      access,
    };
  }
  if (access.status === "unknown") {
    const reason = access.reason ?? classifyAccessStatusMessage("unknown");
    console.warn(`[Hlídač státu] ${reason}`);
    return {
      items: [],
      timingsMs: { hlidacStatuAccessUnknown: Math.round(nowMs() - startedAt) },
      sourceFailures: [{
        sourceLabel: "Hlídač státu",
        reason,
      }],
      access,
    };
  }

  console.warn(
    `[Hlídač státu] VZ API dostupné — stahuji ${procurers.length} zadavatelů (IČO).`,
  );

  const sourceFailures: SourceFailure[] = [];
  const allItems: IngestedZakazka[] = [];

  const results = await mapWithConcurrency(
    [...procurers],
    CONCURRENCY,
    async (procurer) => {
      const t0 = nowMs();
      const result = await fetchIcoAll(procurer, dateFrom);
      timingsMs[`hlidacStatu:${procurer.ico}`] = Math.round(nowMs() - t0);
      return result;
    },
  );

  for (const r of results) {
    allItems.push(...r.items);
    if (r.failure) sourceFailures.push(r.failure);
  }

  timingsMs.fetchHlidacStatuTotalMs = Math.round(nowMs() - startedAt);
  return { items: allItems, timingsMs, sourceFailures, access };
}
