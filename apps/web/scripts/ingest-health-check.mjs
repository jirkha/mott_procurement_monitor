#!/usr/bin/env node
/**
 * Kontrola vzorku uložených sourceUrl (HTTP + základní heuristiky obsahu).
 *
 * Kořen monorepa:
 *   npm run ingest:health-check
 *
 * Env:
 *   HEALTH_CHECK_PER_SOURCE — počet náhodných řádků na zdroj (výchozí 1, max 10)
 *   HEALTH_CHECK_MAX_SOURCES — max. počet zdrojů se zápisem (výchozí 40)
 *   HEALTH_CHECK_FETCH_MS — timeout jednoho requestu (výchozí 15000)
 *   HEALTH_CHECK_RELAXED=1 — HTTP 429 a „deadline na stránce / NULL v DB“ jen varování, ne exit 1
 *
 * Exit 0 = žádná tvrdá chyba; 1 = alespoň jedna tvrdá chyba (4xx/5xx, typická chybová stránka).
 */
import { PrismaClient } from "@prisma/client";
import { ensureDatabaseUrl } from "./load-database-url.mjs";

ensureDatabaseUrl();

const UA = "Mozilla/5.0 (compatible; MOTT-ingest-health-check/1.0; +local-script)";
const PER_SOURCE = Math.min(
  10,
  Math.max(1, Number(process.env.HEALTH_CHECK_PER_SOURCE ?? "1") || 1),
);
const MAX_SOURCES = Math.min(
  500,
  Math.max(1, Number(process.env.HEALTH_CHECK_MAX_SOURCES ?? "40") || 40),
);
const FETCH_MS = Math.max(
  3000,
  Number(process.env.HEALTH_CHECK_FETCH_MS ?? "15000") || 15000,
);
const RELAXED = process.env.HEALTH_CHECK_RELAXED === "1";

const BROKEN_SUBSTRINGS = [
  "vámi požadovaná stránka neexistuje",
  "požadovaná stránka neexistuje",
  "adresa nebyla nalezena",
  "profil neexistuje",
  "profil zadavatele nenalezen",
  "profile does not exist",
];

const prisma = new PrismaClient();

async function fetchSample(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf).slice(0, 200_000);
    return { status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

function hardContentIssues(lower) {
  const hits = [];
  for (const s of BROKEN_SUBSTRINGS) {
    if (lower.includes(s)) hits.push(`page:${s.slice(0, 28)}`);
  }
  return hits;
}

function deadlineHintInHtml(html) {
  return (
    /nab[íi]dk[uy]\s+podat\s+do/i.test(html) ||
    /lh[uů]ta\s+pro\s+pod[aá]n[ií]\s+nab/i.test(html) ||
    /lh[uů]ta\s+pro\s+doru[cč]en[ií]\s+ž/i.test(html) ||
    /ž[aá]dost[ií]\s+o\s+ú[cč]ast/i.test(html)
  );
}

async function main() {
  const sources = await prisma.source.findMany({
    orderBy: { name: "asc" },
    take: MAX_SOURCES,
    where: { zakazky: { some: {} } },
    select: {
      id: true,
      name: true,
      _count: { select: { zakazky: true } },
    },
  });

  let hardErrors = 0;
  let softWarnings = 0;

  console.log(
    ["source", "sample_n", "status", "issues", "title_snip", "url"]
      .join("\t"),
  );

  for (const src of sources) {
    const rows = await prisma.zakazka.findMany({
      where: { sourceId: src.id },
      take: PER_SOURCE,
      orderBy: { updatedAt: "desc" },
      select: { title: true, sourceUrl: true, deadline: true },
    });

    let n = 0;
    for (const row of rows) {
      n++;
      const issues = [];
      let status = "—";
      try {
        const r = await fetchSample(row.sourceUrl);
        status = String(r.status);
        const low = r.text.toLowerCase();
        if (r.status === 429) issues.push("http:429");
        else if (r.status >= 400) issues.push(`http:${r.status}`);
        issues.push(...hardContentIssues(low));
        if (!row.deadline && deadlineHintInHtml(r.text)) {
          issues.push("deadline_hint_html_null_db");
        }
      } catch (e) {
        issues.push(
          `fetch:${e instanceof Error ? e.name : String(e).slice(0, 40)}`,
        );
      }

      let rowHard = false;
      for (const x of issues) {
        if (RELAXED && (x === "http:429" || x === "deadline_hint_html_null_db"))
          continue;
        if (
          x.startsWith("fetch:") ||
          x.startsWith("page:") ||
          (x.startsWith("http:") && x !== "http:429")
        ) {
          rowHard = true;
          break;
        }
        if (!RELAXED && x === "deadline_hint_html_null_db") {
          rowHard = true;
          break;
        }
      }
      if (rowHard) hardErrors++;
      else if (issues.length) softWarnings++;

      const titleSnip = (row.title || "").replace(/\s+/g, " ").slice(0, 60);
      console.log(
        [
          src.name,
          String(n),
          status,
          issues.join(";") || "OK",
          titleSnip,
          row.sourceUrl,
        ]
          .map((c) => c.replace(/\t/g, " "))
          .join("\t"),
      );
    }
  }

  console.error(
    `Hotovo. Tvrdé problémy (řádky výše): odhad ${hardErrors}, varování: ${softWarnings}`,
  );
  process.exit(hardErrors > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
