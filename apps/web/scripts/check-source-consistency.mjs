#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const sourceConfigPath = join(
  repoRoot,
  "apps",
  "web",
  "src",
  "lib",
  "ingestion",
  "source-config.ts",
);
const mrizkaPath = join(repoRoot, ".cursor", "mrizka_dopravnich_zadavatelu_CZ.md");

function countQuotedItemsFromArrayBlock(content, exportName) {
  const re = new RegExp(
    `export const ${exportName}:[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\];`,
    "m",
  );
  const m = content.match(re);
  if (!m) return null;
  return (m[1].match(/"[^"]+"/g) || []).length;
}

function countByTokenInArrayBlock(content, exportName, token) {
  const re = new RegExp(
    `export const ${exportName}:[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\];`,
    "m",
  );
  const m = content.match(re);
  if (!m) return null;
  return (m[1].match(new RegExp(token, "g")) || []).length;
}

function readCountFromMrizka(md, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*(\\d+)\\s*\\|`, "m");
  const m = md.match(re);
  return m ? Number(m[1]) : null;
}

async function main() {
  const [sourceConfig, mrizka] = await Promise.all([
    readFile(sourceConfigPath, "utf8"),
    readFile(mrizkaPath, "utf8"),
  ]);

  const actual = {
    nen: countQuotedItemsFromArrayBlock(sourceConfig, "NEN_PROFILE_SLUGS"),
    xml: countByTokenInArrayBlock(sourceConfig, "XML_PROFILY_ZADAVATELU", "xmlBaseUrl:"),
    ezak: countByTokenInArrayBlock(sourceConfig, "EZAK_PORTALS", "indexUrl:"),
    vvz: countByTokenInArrayBlock(sourceConfig, "VVZ_RSS_FEEDS", "url:"),
    nkodCsv: countByTokenInArrayBlock(sourceConfig, "NKOD_CSV_DATASETS", "csvUrl:"),
  };

  const expected = {
    nen: readCountFromMrizka(mrizka, "NEN XML profily"),
    xml:
      (readCountFromMrizka(mrizka, "TenderArena XML profily") ?? 0) +
      (readCountFromMrizka(mrizka, "PROEBIZ XML profil") ?? 0) +
      (readCountFromMrizka(mrizka, "eGORDION XML profil") ?? 0) +
      (readCountFromMrizka(mrizka, "EVEZA XML profil") ?? 0),
    ezak: readCountFromMrizka(mrizka, "E-ZAK HTML scraping"),
    vvz: readCountFromMrizka(mrizka, "VVZ RSS"),
    nkodCsv: readCountFromMrizka(mrizka, "NKOD CSV"),
  };

  const checks = [
    ["NEN XML profily", expected.nen, actual.nen],
    ["XML profily (TenderArena+PROEBIZ+eGORDION+EVEZA)", expected.xml, actual.xml],
    ["E-ZAK HTML scraping", expected.ezak, actual.ezak],
    ["VVZ RSS", expected.vvz, actual.vvz],
    ["NKOD CSV", expected.nkodCsv, actual.nkodCsv],
  ];

  let hasMismatch = false;
  for (const [name, exp, act] of checks) {
    if (exp == null || act == null) {
      console.log(`[WARN] ${name}: nelze načíst hodnotu (expected=${exp}, actual=${act}).`);
      hasMismatch = true;
      continue;
    }
    if (exp !== act) {
      console.log(`[MISMATCH] ${name}: mřížka=${exp}, source-config=${act}`);
      hasMismatch = true;
    } else {
      console.log(`[OK] ${name}: ${act}`);
    }
  }

  process.exit(hasMismatch ? 1 : 0);
}

main().catch((err) => {
  console.error(`[ERROR] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
