import { classify } from "./classifier";
import {
  htmlToCzPortalPlainText,
  parseCzDeadlineDateToken,
  parseDeadlineFromCzPortalHtml,
} from "./cz-deadline-html";
import { decodeHtmlEntities } from "./html-decode";
import {
  fetchWithTimeout,
  mapWithConcurrency,
  nowMs,
  resolvePositiveInt,
} from "./perf";
import { EZAK_PORTALS } from "./source-config";
import type { IngestedZakazka } from "./types";

const FETCH_TIMEOUT_MS = resolvePositiveInt(
  process.env.INGEST_FETCH_TIMEOUT_MS,
  15000,
);
const FETCH_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_EZAK_CONCURRENCY,
  6,
);
/** Úplně vypnout dotahování detailu E‑ZAK: INGEST_EZAK_DETAIL_DEADLINE=0 */
const EZAK_DETAIL_DEADLINE =
  process.env.INGEST_EZAK_DETAIL_DEADLINE !== "0" &&
  process.env.INGEST_EZAK_DETAIL_DEADLINE !== "false";

/**
 * Dotahování z HTML detailu E‑ZAK:
 * - Výchozí: `always` — u každé položky přepsat „datum zahájení“ i lhůtu z detailu (shoda se zdrojovou stránkou).
 * - Levnější režim: INGEST_EZAK_DETAIL_ENRICH=deadline — dotáhnout detail jen kde z přehledu chybí lhůta.
 */
type EzakDetailEnrichMode = "off" | "deadline" | "always";

function ezakDetailEnrichMode(): EzakDetailEnrichMode {
  if (!EZAK_DETAIL_DEADLINE) return "off";
  const v = (process.env.INGEST_EZAK_DETAIL_ENRICH ?? "").trim().toLowerCase();
  if (v === "deadline" || v === "missing-only") return "deadline";
  return "always";
}

const EZAK_DETAIL_DEADLINE_CONCURRENCY = resolvePositiveInt(
  process.env.INGEST_EZAK_DETAIL_DEADLINE_CONCURRENCY,
  4,
);

type SourceBatch = {
  items: IngestedZakazka[];
  timingsMs: Record<string, number>;
};

function stripTdInner(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Datum zahájení v E-ZAK tabulce — shodně se starým kódem u formátu bez času (UTC půlnoc). */
function parsePublicationCz(s: string): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const y = m[3];
  return new Date(`${y}-${mo}-${d}T00:00:00Z`);
}

/** „Lhůta pro nabídky / žádosti“ — řádky v přehledu E‑ZAK. */
function parseOffersDeadlineCz(s: string): Date | null {
  return parseCzDeadlineDateToken(s);
}

function firstDateLikeCz(s: string): string | null {
  const m =
    /(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}(?:\s+\d{1,2}:\d{2})?)/.exec(s);
  return m?.[1] ?? null;
}

type TbodyRowPair = {
  detailPath: string;
  title: string;
  datumZahajeniRaw: string;
  lhutaNabidkyRaw: string;
};

function parseEzakTbodyPairs(htmlText: string): TbodyRowPair[] {
  const out: TbodyRowPair[] = [];
  const tbodyRe = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi;
  let tb: RegExpExecArray | null;
  while ((tb = tbodyRe.exec(htmlText)) !== null) {
    const inner = tb[1];
    const rowMatches = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length < 2) continue;

    let detailPath: string | null = null;
    let title: string | null = null;
    let linkRowIndex = -1;

    for (let r = 0; r < rowMatches.length; r++) {
      const rowHtml = rowMatches[r][1];
      const linkMatch =
        /<a href="(contract_display_\d+\.html)">\s*([^<]+)\s*<\/a>/.exec(rowHtml);
      if (linkMatch) {
        detailPath = linkMatch[1];
        title = linkMatch[2].trim();
        linkRowIndex = r;
        break;
      }
    }
    if (!detailPath || !title || linkRowIndex < 0) continue;

    let datumZahajeniRaw = "";
    let lhutaNabidkyRaw = "";
    let found = false;

    /* Po řádku s odkazem: přeskočit řádky typu sub-name (1 buňka). Data: obvykle poslední dvě buňky = zahájení + lhůta (JMK má navíc řádek zadavatel). */
    for (let r = linkRowIndex + 1; r < rowMatches.length; r++) {
      const rowHtml = rowMatches[r][1];
      const cells = [
        ...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi),
      ].map((c) => stripTdInner(c[1]));
      if (cells.length < 2) continue;
      const dLast = firstDateLikeCz(cells[cells.length - 1] ?? "");
      const dPrev = firstDateLikeCz(cells[cells.length - 2] ?? "");
      if (dPrev && dLast) {
        datumZahajeniRaw = dPrev;
        lhutaNabidkyRaw = dLast;
        found = true;
        break;
      }
    }
    if (!found) continue;

    out.push({
      detailPath,
      title,
      datumZahajeniRaw,
      lhutaNabidkyRaw,
    });
  }
  return out;
}

function ingestFromEzakTbodyPairs(
  pairs: TbodyRowPair[],
  profileName: string,
  baseUrl: string,
  dateFrom: Date,
): IngestedZakazka[] {
  const items: IngestedZakazka[] = [];
  for (const row of pairs) {
    const pubDate = parsePublicationCz(row.datumZahajeniRaw);
    if (pubDate && pubDate < dateFrom) continue;

    const { disciplina, klicova_slova } = classify(row.title);
    if (!disciplina) continue;

    const deadline = parseOffersDeadlineCz(row.lhutaNabidkyRaw);
    const id = `ezak-${baseUrl.replace(/[^a-zA-Z0-9]/g, "")}-${row.detailPath.replace(".html", "")}`;

    items.push({
      id,
      zdroj: `Profil - ${profileName}`,
      nazev: row.title,
      popis: `Zakázka z profilu zadavatele (${profileName}).`,
      url: `${baseUrl}/${row.detailPath}`,
      datum_publikace: pubDate ? pubDate.toISOString() : null,
      datum_aktualizace: pubDate ? pubDate.toISOString() : null,
      termin_podani_nabidky: deadline ? deadline.toISOString() : null,
      disciplina,
      klicova_slova,
    });
  }
  return items;
}

/** Záložní parsování jednoho &lt;tr&gt; s odkazem i daty (jiné šablony portálů). */
function ingestLegacyRows(
  htmlText: string,
  profileName: string,
  baseUrl: string,
  dateFrom: Date,
): IngestedZakazka[] {
  const items: IngestedZakazka[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = rowRegex.exec(htmlText)) !== null) {
    const rowHtml = match[1];

    const linkMatch =
      /<a href="(contract_display_\d+\.html)">\s*([^<]+)\s*<\/a>/.exec(rowHtml);
    if (!linkMatch) continue;

    const detailPath = linkMatch[1];
    const title = linkMatch[2].trim();

    const datesRegex = /([0-9]{2}\.[0-9]{2}\.[0-9]{4})(?:\s+([0-9]{1,2}:[0-9]{2}))?/g;
    const dateHits: string[] = [];
    let dMatch;
    while ((dMatch = datesRegex.exec(rowHtml)) !== null) {
      dateHits.push(
        dMatch[2] ? `${dMatch[1]} ${dMatch[2]}` : dMatch[1],
      );
    }

    let pubDate: Date | null = null;
    if (dateHits.length > 0) {
      const first = parsePublicationCz(dateHits[0].split(/\s+/)[0]) ??
        parseOffersDeadlineCz(dateHits[0]);
      if (first && !isNaN(first.getTime())) pubDate = first;
    }

    let deadline: Date | null = null;
    if (dateHits.length >= 2) {
      deadline = parseOffersDeadlineCz(dateHits[1]);
    }

    if (pubDate && pubDate < dateFrom) continue;

    const { disciplina, klicova_slova } = classify(title);
    if (!disciplina) continue;

    const id = `ezak-${baseUrl.replace(/[^a-zA-Z0-9]/g, "")}-${detailPath.replace(".html", "")}`;

    items.push({
      id,
      zdroj: `Profil - ${profileName}`,
      nazev: title,
      popis: `Zakázka z profilu zadavatele (${profileName}).`,
      url: `${baseUrl}/${detailPath}`,
      datum_publikace: pubDate ? pubDate.toISOString() : null,
      datum_aktualizace: pubDate ? pubDate.toISOString() : null,
      termin_podani_nabidky: deadline ? deadline.toISOString() : null,
      disciplina,
      klicova_slova,
    });
  }
  return items;
}

/** Z veřejného detailu VZ (E-ZAK) — sdílené fráze včetně entit a žádosti o účast. */
export function parseDeadlineFromEzakDetailHtml(html: string): Date | null {
  return parseDeadlineFromCzPortalHtml(html);
}

/** Parsování „datum zahájení“ z HTML detailu (E-ZAK a obdobné portály). */
export function parsePublicationFromEzakDetailHtml(html: string): Date | null {
  const plain = htmlToCzPortalPlainText(html);
  const m =
    /datum\s+zah[aá]jen[ií]\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i.exec(
      plain,
    );
  if (!m) return null;
  return (
    parseCzDeadlineDateToken(m[1]) ?? parsePublicationCz(m[1].split(/\s+/)[0])
  );
}

async function enrichEzakFromDetails(items: IngestedZakazka[]): Promise<void> {
  const mode = ezakDetailEnrichMode();
  if (mode === "off") return;
  const need =
    mode === "always"
      ? items
      : items.filter((i) => !i.termin_podani_nabidky);
  if (need.length === 0) return;

  await mapWithConcurrency(
    need,
    EZAK_DETAIL_DEADLINE_CONCURRENCY,
    async (item) => {
      try {
        const res = await fetchWithTimeout(
          item.url,
          { cache: "no-store" },
          FETCH_TIMEOUT_MS,
        );
        if (!res.ok) return;
        const html = await res.text();
        const pub = parsePublicationFromEzakDetailHtml(html);
        if (pub && !isNaN(pub.getTime())) {
          const iso = pub.toISOString();
          item.datum_publikace = iso;
          item.datum_aktualizace = iso;
        }
        const dt = parseDeadlineFromEzakDetailHtml(html);
        if (dt && !isNaN(dt.getTime())) {
          item.termin_podani_nabidky = dt.toISOString();
        }
      } catch {
        /* jednotlivé chyby detailu ignorovat */
      }
    },
  );
}

async function fetchEzakProfile(
  profileName: string,
  indexUrl: string,
  baseUrl: string,
  dateFrom: Date,
): Promise<{ items: IngestedZakazka[]; durationMs: number }> {
  const startedAt = nowMs();
  try {
    const res = await fetchWithTimeout(
      indexUrl,
      { cache: "no-store" },
      FETCH_TIMEOUT_MS,
    );

    if (!res.ok) {
      const errBody = await res.text();
      let host = "";
      try {
        host = new URL(indexUrl).hostname;
      } catch {
        /* ignore */
      }
      // #region agent log
      fetch("http://127.0.0.1:7650/ingest/16c7ab11-054f-481f-a5d7-92fab7987611", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "654507",
        },
        body: JSON.stringify({
          sessionId: "654507",
          location: "ezak_fetcher.ts:fetchEzakProfile",
          message: "E-ZAK profile HTTP non-OK",
          data: {
            hypothesisId: "H1-H5",
            profileName,
            host,
            status: res.status,
            statusText: res.statusText,
            server: res.headers.get("server"),
            contentType: res.headers.get("content-type"),
            retryAfter: res.headers.get("retry-after"),
            fetchConcurrency: FETCH_CONCURRENCY,
            bodyPrefix: errBody.slice(0, 200).replace(/\s+/g, " "),
          },
          timestamp: Date.now(),
          runId: "pre-fix",
        }),
      }).catch(() => {});
      // #endregion
      throw new Error(`E-ZAK fetch failed: ${res.status}`);
    }
    const htmlText = await res.text();

    const pairs = parseEzakTbodyPairs(htmlText);
    const items =
      pairs.length > 0
        ? ingestFromEzakTbodyPairs(pairs, profileName, baseUrl, dateFrom)
        : ingestLegacyRows(htmlText, profileName, baseUrl, dateFrom);

    await enrichEzakFromDetails(items);

    return { items, durationMs: Math.round(nowMs() - startedAt) };
  } catch (error: unknown) {
    console.error(`fetchEzakProfile error for ${profileName}:`, error);
    return { items: [], durationMs: Math.round(nowMs() - startedAt) };
  }
}

export async function getEzakZakazkyWithStats(): Promise<SourceBatch> {
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - 6);

  const results = await mapWithConcurrency(
    EZAK_PORTALS,
    FETCH_CONCURRENCY,
    async (p) => {
      const result = await fetchEzakProfile(
        p.name,
        p.indexUrl,
        p.baseUrl,
        dateFrom,
      );
      return { ...result, name: p.name };
    },
  );

  const timingsMs: Record<string, number> = {};
  for (const r of results) {
    timingsMs[`ezak:${r.name}`] = r.durationMs;
  }

  return {
    items: results.flatMap((r) => r.items),
    timingsMs,
  };
}

export async function getEzakZakazky(): Promise<IngestedZakazka[]> {
  const { items } = await getEzakZakazkyWithStats();
  return items;
}
