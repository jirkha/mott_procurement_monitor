#!/usr/bin/env node
/**
 * Lokální ověření kandidátů na zdroje (E‑ZAK contract_index / NEN XML export).
 *
 * Spuštění z kořene monorepa:
 *   npm run probe-zdroje
 *
 * Vlastní soubor s kandidáty:
 *   npm run probe-zdroje -- path/k/jinemuseznamu.json
 *
 * Výstup: TSV (štítek, typ, HTTP / stav, contract_display počet / XML ok, URL)
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const UA =
  "Mozilla/5.0 (compatible; MOTT-probe-zdroje/1.0; +local-script)";
const TIMEOUT_MS = 35_000;

function formatNenDate(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}${month}${year}`;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

function countContractDisplay(html) {
  const m = html.match(/contract_display_\d+\.html/g);
  return m ? m.length : 0;
}

function xmlLooksValid(s) {
  const t = s.replace(/^\uFEFF/, "").trimStart();
  return t.startsWith("<?xml") || t.startsWith("<profil");
}

async function probeEzak(label, url) {
  try {
    const { ok, status, text } = await fetchText(url);
    const n = countContractDisplay(text);
    const hint =
      ok && n > 0
        ? "OK_EZAK"
        : ok && n === 0
          ? "HTTP_OK_BEZ_contract_display"
          : "HTTP_CHYBA";
    return { label, kind: "ezak", status: String(status), detail: String(n), hint, url };
  } catch (e) {
    const msg = e instanceof Error ? e.name + ":" + e.message : String(e);
    return { label, kind: "ezak", status: "—", detail: "—", hint: "FETCH_" + msg.slice(0, 80), url };
  }
}

async function probeNen(label, slug) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const url = `https://nen.nipez.cz/profil/${encodeURIComponent(slug)}/XMLdataVZ?od=${formatNenDate(from)}&do=${formatNenDate(to)}`;
  try {
    const { ok, status, text } = await fetchText(url);
    const valid = xmlLooksValid(text);
    const ne = /neexistuje/i.test(text.slice(0, 200));
    const hint = valid ? "OK_NEN_XML" : ne ? "NEN_PROFIL_NEEXISTUJE" : ok ? "NEN_ODPOVED_NE_XML" : "HTTP_CHYBA";
    return {
      label,
      kind: "nen",
      status: String(status),
      detail: valid ? "xml" : ne ? "text" : "?",
      hint,
      url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.name + ":" + e.message : String(e);
    return { label, kind: "nen", status: "—", detail: "—", hint: "FETCH_" + msg.slice(0, 80), url };
  }
}

function tsvEscape(s) {
  const x = String(s).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return x.includes('"') ? `"${x.replace(/"/g, '""')}"` : x;
}

async function main() {
  const listPath =
    process.argv[2] ?? join(__dirname, "probe-zdroje-candidates.json");
  const raw = await readFile(listPath, "utf8");
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) {
    console.error("Soubor musí obsahovat JSON pole objektů.");
    process.exit(1);
  }

  const rows = [];
  for (const item of items) {
    const label = item.label ?? "(bez názvu)";
    if (item.nenProfile) {
      rows.push(await probeNen(label, item.nenProfile));
    } else if (item.url) {
      rows.push(await probeEzak(label, item.url));
    } else {
      rows.push({
        label,
        kind: "?",
        status: "—",
        detail: "—",
        hint: "CHYBA_VSTUPU",
        url: "—",
      });
    }
  }

  console.log(
    ["štítek", "typ", "http", "detail", "výsledek", "url"]
      .map(tsvEscape)
      .join("\t"),
  );
  for (const r of rows) {
    console.log(
      [r.label, r.kind, r.status, r.detail, r.hint, r.url]
        .map(tsvEscape)
        .join("\t"),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
