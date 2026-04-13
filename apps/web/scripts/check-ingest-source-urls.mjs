#!/usr/bin/env node
/**
 * Rychlá kontrola dostupnosti veřejných URL po ingestu (HTTP stav).
 * Použití: node scripts/check-ingest-source-urls.mjs
 *
 * Volitelně: URL oddělené mezerami v argv — jinak vestavěné vzorky.
 */

const samples =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        "https://profily.proebiz.com/verejne-zakazky/5761",
        "https://zakazky.krajbezkorupce.cz/contract_display_44756.html",
        "https://josephine.proebiz.com/cs/tender/76436/summary",
      ];

async function headStatus(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "MOTT-monitor/1.0 (+check-ingest-source-urls)" },
    });
    return res.status;
  } catch (e) {
    return `ERR:${e instanceof Error ? e.message : String(e)}`;
  }
}

async function main() {
  let bad = 0;
  for (const u of samples) {
    const st = await headStatus(u);
    const ok = st === 200;
    if (!ok) bad++;
    console.log(`${ok ? "OK " : "BAD"} ${st}\t${u}`);
  }
  process.exitCode = bad > 0 ? 1 : 0;
}

main();
