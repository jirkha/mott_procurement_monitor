/**
 * Konfigurace veřejných zdrojů pro sběr zakázek (NEN profily, E‑ZAK portály, RSS).
 *
 * NEN: segment `{slug}` musí být přesný identifikátor profilu v URL na NIPES
 * (např. z detailu profilu). Odhadované zkratky typu „SFDI“ nebo „CD“ často
 * vrátí text „Profil … neexistuje“ — takové slugy sem nepatří, dokud nejsou ověřeny.
 *
 * Zápis v registru zadavatelů (např. Státní fond dopravní infrastruktury, IČO 70856508)
 * ještě neznamená **platný profil zadavatele** ve smyslu exportu XML: v datech NEN u
 * subjektu může být splněna podmínka zadavatele, ale ne „existuje platný Profil_LW“ —
 * pak slug vůbec není a zakázky jdou jinudy (VVZ, jiný portál). Takové organizace do
 * `NEN_PROFILE_SLUGS` nepřidávat.
 */

/** Profily zadavatelů na NEN (XML export) — pouze ověřené slugy. */
export const NEN_PROFILE_SLUGS: readonly string[] = [
  "MDCR",
  "RSD",
  "RVCCR",
  "ZLK",
];

/**
 * Generický XMLdataVZ profil zadavatele — formát dle vyhlášky č. 345/2023 Sb.
 * Používá se pro PROEBIZ, eGORDION a další systémy se standardním XML exportem.
 * NEN profily zůstávají v `NEN_PROFILE_SLUGS` (kvůli odlišnému URL vzoru).
 */
export type XmlProfilZadavatele = {
  name: string;
  /** Celá URL k XMLdataVZ (bez parametrů `od` a `do` — ty se doplní automaticky). */
  xmlBaseUrl: string;
  /** URL detailu zakázky, kam se doplní id_objektu (přes template `{id}`). */
  detailUrlTemplate?: string;
  /** Prefix pro id záznamu v DB. */
  idPrefix: string;
};

export const XML_PROFILY_ZADAVATELU: readonly XmlProfilZadavatele[] = [
  {
    name: "DPP Praha (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/DPP/XMLdataVZ",
    idPrefix: "ta-dpp",
  },
  {
    name: "České dráhy (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/CD/XMLdataVZ",
    idPrefix: "ta-cd",
  },
  {
    name: "HMP – Magistrát (TenderArena)",
    xmlBaseUrl:
      "https://www.tenderarena.cz/profily/HlavniMestoPraha/XMLdataVZ",
    idPrefix: "ta-hmp",
  },
  {
    name: "Jihočeský kraj (TenderArena)",
    xmlBaseUrl:
      "https://www.tenderarena.cz/profily/JihoceskyKraj/XMLdataVZ",
    idPrefix: "ta-jck",
  },
  {
    name: "Ostrava (TenderArena)",
    xmlBaseUrl:
      "https://www.tenderarena.cz/profily/Ostrava/XMLdataVZ",
    idPrefix: "ta-ostrava",
  },
  {
    name: "ČEPS (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/CEPS/XMLdataVZ",
    idPrefix: "ta-ceps",
  },
  {
    name: "DPMO Olomouc (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/DPMOas/XMLdataVZ",
    idPrefix: "ta-dpmo",
  },
  {
    name: "DPO Ostrava (PROEBIZ)",
    xmlBaseUrl:
      "https://profily.proebiz.com/profile/61974757/XMLdataVZ",
    detailUrlTemplate:
      "https://profily.proebiz.com/verejne-zakazky/{id}",
    idPrefix: "proebiz-dpo",
  },
  {
    name: "DPMB Brno (PROEBIZ)",
    xmlBaseUrl:
      "https://profily.proebiz.com/profile/25508881/XMLdataVZ",
    detailUrlTemplate:
      "https://profily.proebiz.com/verejne-zakazky/{id}",
    idPrefix: "proebiz-dpmb",
  },
  {
    name: "Olomoucký kraj (eGORDION)",
    xmlBaseUrl:
      "https://www.egordion.cz/nabidkaGORDION/profilOlomouckykraj/XMLdataVZ",
    idPrefix: "egordion-olkraj",
  },
  {
    name: "České Budějovice (eGORDION)",
    xmlBaseUrl:
      "https://www.egordion.cz/nabidkaGORDION/profilgordionBudejovice/XMLdataVZ",
    idPrefix: "egordion-cbudejovice",
  },
  {
    name: "Olomouc město (EVEZA)",
    xmlBaseUrl:
      "https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/XMLdataVZ",
    detailUrlTemplate:
      "https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/zakazka/{id}",
    idPrefix: "eveza-olomouc",
  },
  {
    name: "Hradec Králové (TenderArena)",
    xmlBaseUrl:
      "https://www.tenderarena.cz/profily/hradeckralove/XMLdataVZ",
    idPrefix: "ta-hradeckralove",
  },
  {
    name: "DPMP Pardubice (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/DPMP/XMLdataVZ",
    idPrefix: "ta-dpmp",
  },
  {
    name: "DPMÚL Ústí nad Labem (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/DPMUL/XMLdataVZ",
    idPrefix: "ta-dpmul",
  },
  {
    name: "DP Mladá Boleslav (TenderArena)",
    xmlBaseUrl: "https://www.tenderarena.cz/profily/DPMLB/XMLdataVZ",
    idPrefix: "ta-dpmlb",
  },
];

export type EzakPortal = {
  /** Název v UI a ve sloupci zdroj (Profil - …). */
  name: string;
  /** Index zakázek v rozhraní E‑ZAK / TenderArena kompatibilním rozhraní. */
  indexUrl: string;
  /** Kořen pro detailní URL (např. https://ezak.brno.cz). */
  baseUrl: string;
};

/**
 * Veřejné profily s rozhraním contract_index.html (jako u původního dema).
 * Neplatné URL při běhu tiše vrátí 0 položek (viz fetcher).
 */
export const EZAK_PORTALS: readonly EzakPortal[] = [
  {
    name: "E‑ZAK Brno",
    indexUrl: "https://ezak.brno.cz/contract_index.html",
    baseUrl: "https://ezak.brno.cz",
  },
  {
    name: "E‑ZAK Kraj Vysočina",
    indexUrl: "https://ezak.kr-vysocina.cz/contract_index.html",
    baseUrl: "https://ezak.kr-vysocina.cz",
  },
  {
    name: "Správa železnic",
    indexUrl: "https://zakazky.spravazeleznic.cz/contract_index.html",
    baseUrl: "https://zakazky.spravazeleznic.cz",
  },
  {
    name: "Pardubický kraj",
    indexUrl: "https://zakazky.pardubickykraj.cz/contract_index.html",
    baseUrl: "https://zakazky.pardubickykraj.cz",
  },
  {
    name: "Středočeský kraj",
    indexUrl: "https://zakazky.kr-stredocesky.cz/contract_index.html",
    baseUrl: "https://zakazky.kr-stredocesky.cz",
  },
  {
    name: "Liberecký kraj",
    indexUrl: "https://zakazky.liberec.cz/contract_index.html",
    baseUrl: "https://zakazky.liberec.cz",
  },
  {
    name: "DPMLJ (Liberec/Jablonec)",
    indexUrl: "https://zakazky.liberec.cz/contract_index_482.html",
    baseUrl: "https://zakazky.liberec.cz",
  },
  {
    name: "Karlovarský kraj",
    indexUrl: "https://ezak.kr-karlovarsky.cz/contract_index.html",
    baseUrl: "https://ezak.kr-karlovarsky.cz",
  },
  {
    name: "Jihomoravský kraj",
    indexUrl: "https://zakazky.krajbezkorupce.cz/contract_index.html",
    baseUrl: "https://zakazky.krajbezkorupce.cz",
  },
  {
    name: "Plzeňský kraj (CNPK)",
    indexUrl: "https://ezak.cnpk.cz/contract_index.html",
    baseUrl: "https://ezak.cnpk.cz",
  },
  {
    name: "PMDP Plzeň",
    indexUrl: "https://zakazky.pmdp.cz/contract_index.html",
    baseUrl: "https://zakazky.pmdp.cz",
  },
  {
    name: "Ostrava-Jih (MO)",
    indexUrl: "https://zakazky.ovajih.cz/contract_index.html",
    baseUrl: "https://zakazky.ovajih.cz",
  },
  {
    name: "Úřad vlády",
    indexUrl: "https://zakazky.vlada.cz/contract_index.html",
    baseUrl: "https://zakazky.vlada.cz",
  },
  {
    name: "Ministerstvo práce a sociálních věcí",
    indexUrl: "https://mpsv.ezak.cz/contract_index.html",
    baseUrl: "https://mpsv.ezak.cz",
  },
  {
    name: "Moravskoslezský kraj",
    indexUrl: "https://msk.ezak.cz/contract_index.html",
    baseUrl: "https://msk.ezak.cz",
  },
  {
    name: "Královéhradecký kraj",
    indexUrl: "https://zakazky.cenakhk.cz/contract_index.html",
    baseUrl: "https://zakazky.cenakhk.cz",
  },
  {
    name: "Ústí nad Labem (město)",
    indexUrl: "https://zakazky.usti-nad-labem.cz/contract_index.html",
    baseUrl: "https://zakazky.usti-nad-labem.cz",
  },
  {
    name: "Ministerstvo zemědělství (EAGRI)",
    indexUrl: "https://zakazky.eagri.cz/contract_index.html",
    baseUrl: "https://zakazky.eagri.cz",
  },
  {
    name: "Státní pozemkový úřad",
    indexUrl: "https://zakazky.spucr.cz/contract_index.html",
    baseUrl: "https://zakazky.spucr.cz",
  },
  {
    name: "Jihlava",
    indexUrl: "https://zakazky.jihlava.cz/contract_index.html",
    baseUrl: "https://zakazky.jihlava.cz",
  },
  {
    name: "Krajská zdravotní (Ústecký kr.)",
    indexUrl: "https://zakazky.kzcr.eu/contract_index.html",
    baseUrl: "https://zakazky.kzcr.eu",
  },
];

export type VvzRssFeed = {
  url: string;
  /** Pokud není uvedeno, zůstane obecný název zdroje ve fetcheri. */
  sourceLabel?: string;
};

/** RSS/Atom kanály VVZ / související (doplňovat podle dostupnosti). */
export const VVZ_RSS_FEEDS: readonly VvzRssFeed[] = [
  { url: "https://vvz.nipez.cz/rss/zakazky.xml" },
  { url: "https://vvz.nipez.cz/rss/vvz.xml" },
];

/**
 * Otevřená data z NKOD (CSV se známým schématem, často přes úložiště poskytovatele).
 * Schéma: sloupce dle poskytovatele (např. OICT — `verejne_zakazky_opendata_zadano.schema.json`).
 */
export type NkodCsvColumnMap = {
  systemKey: string;
  title: string;
  description: string;
  dateStart: string;
  dateContractEnd: string;
  dateUpdated: string;
};

/** Výchozí mapování = OICT „zadané“ VZ (Golemio / Pražský katalog). */
export const NKOD_CSV_COLUMNS_OICT_ZADANO: NkodCsvColumnMap = {
  systemKey: "systemove_cislo_zakazky",
  title: "nazev_zakazky",
  description: "strucny_popis_predmetu",
  dateStart: "datum_zahajeni",
  dateContractEnd: "datum_uzavreni_smlouvy",
  dateUpdated: "updated_at",
};

export type NkodCsvDataset = {
  /** Interní název pro logy */
  name: string;
  /** Popisek zdroje v DB / UI (`zdroj`) */
  sourceLabel: string;
  csvUrl: string;
  /** Stránka datové sady u poskytovatele; kotva = systémový klíč (unikátní URL pro deduplikaci). */
  landingPageUrl: string;
  /** Záznam datové sady na NKOD (data.gov.cz) — dokumentace / licence; volitelné. */
  nkodCatalogUrl?: string;
  /** Předpona `externalRef` v `IngestedZakazka.id` */
  idPrefix: string;
  /** Jiné názvy sloupců než OICT — sloučí se s `NKOD_CSV_COLUMNS_OICT_ZADANO`. */
  columns?: Partial<NkodCsvColumnMap>;
};

/** CSV distribuce přes NKOD (priorita 4) — doplňovat po ověření sloupců a licence. */
export const NKOD_CSV_DATASETS: readonly NkodCsvDataset[] = [
  {
    name: "OICT Praha",
    sourceLabel: "NKOD – OICT Praha (CSV)",
    csvUrl:
      "https://storage.golemio.cz/ckan/vz_oict/verejne_zakazky_opendata_zadano.csv",
    landingPageUrl: "https://opendata.praha.eu/dataset/verejne-zakazky-oict",
    nkodCatalogUrl:
      "https://data.gov.cz/dataset?iri=https%3A%2F%2Fdata.gov.cz%2Fzdroj%2Fdatov%C3%A9-sady%2F02795281%2F81cbcee16d29a0669415260d57b117f7",
    idPrefix: "nkod-oict-praha",
  },
];

export type NkodMmrAggregateDataset = {
  /** Interní název pro logy a timing. */
  name: string;
  /** Popisek v analytickém výstupu. */
  sourceLabel: string;
  /** Přímá XML distribuce agregovaných statistik MMR/ISVZ. */
  xmlUrl: string;
  /** Odkaz na metadata datové sady (NKOD/GitHub jsonld). */
  metadataUrl: string;
};

/** Celostátní agregované NKOD/MMR sady (analytický doplněk, ne feed jednotlivých VZ). */
export const NKOD_MMR_AGGREGATE_DATASETS: readonly NkodMmrAggregateDataset[] = [
  {
    name: "MMR Zadané VZ podle typu",
    sourceLabel: "NKOD – MMR (XML agregace podle typu)",
    xmlUrl:
      "https://isvz.nipez.cz/sites/default/files/content/opendata/Zadan%C3%A9%20Ve%C5%99ejn%C3%A9%20Zak%C3%A1zky%20podle%20Typu-cs.xml",
    metadataUrl:
      "https://raw.githubusercontent.com/opendata-mmr/lkod-min/main/datov%C3%A9-sady/zadane-vz-typ.jsonld",
  },
  {
    name: "MMR Zadané VZ podle druhu",
    sourceLabel: "NKOD – MMR (XML agregace podle druhu)",
    xmlUrl:
      "https://isvz.nipez.cz/sites/default/files/content/opendata/Zadan%C3%A9%20Ve%C5%99ejn%C3%A9%20Zak%C3%A1zky%20podle%20Druhu-cs.xml",
    metadataUrl:
      "https://raw.githubusercontent.com/opendata-mmr/lkod-min/main/datov%C3%A9-sady/zadane-vz-druh.jsonld",
  },
];

export type ActiveAggregatorSource = {
  /** Stabilní interní id aktivního agregátoru. */
  id: "josephine";
  /** Popisek zdroje v UI/DB. */
  sourceLabel: string;
  /** Výchozí veřejný listing URL. */
  listingUrl: string;
  /** Další veřejné listing stránky (stejný parser jako u `listingUrl`). */
  extraListingUrls?: readonly string[];
  /** Poznámka k technickému riziku/omezení. */
  riskNote: string;
};

/**
 * Aktivní agregátory mimo veřejné CZ zdroje.
 * JOSEPHINE je od 2026-04 vedený jako aktivně integrovaný zdroj (mimo pilot).
 */
export const ACTIVE_AGGREGATORS: readonly ActiveAggregatorSource[] = [
  {
    id: "josephine",
    sourceLabel: "JOSEPHINE",
    listingUrl: "https://josephine.proebiz.com/",
    riskNote: "Veřejný listing dostupný; riziko budoucích anti-bot omezení.",
  },
];

export type PilotAggregatorSource = {
  /** Stabilní interní id (pro metriky a rozhodnutí GO/NO-GO). */
  id: "najdivz" | "gemin";
  /** Popisek zdroje v UI/DB. */
  sourceLabel: string;
  /** Výchozí veřejný listing URL pro minimální pilot. */
  listingUrl: string;
  /** Další veřejné listing stránky (stejný parser jako u `listingUrl`). */
  extraListingUrls?: readonly string[];
  /** Poznámka k technickému riziku/omezení. */
  riskNote: string;
};

/**
 * Krok 2 pilotu komerčních agregátorů:
 * - NajdiVZ + Gemin (Gemin lze vypnout env INGEST_PILOT_DISABLE_GEMIN=1)
 */
export const PILOT_AGGREGATORS: readonly PilotAggregatorSource[] = [
  {
    id: "najdivz",
    sourceLabel: "NajdiVZ (pilot)",
    listingUrl: "https://www.najdivz.cz/nejnovejsi-verejne-zakazky",
    riskNote: "Listing dostupný; API/XML export je komerční.",
  },
  {
    id: "gemin",
    sourceLabel: "Gemin (pilot)",
    listingUrl: "https://www.gemin.cz/",
    extraListingUrls: ["https://www.gemin.cz/verejne-zakazky"],
    riskNote:
      "Pilot uzavřen jako NO-GO (2026-04): malý počet odkazů z listingů, po klasifikaci typicky 0 dopravně relevantních položek vůči existujícím zdrojům. Konektor lze vypnout env INGEST_PILOT_DISABLE_GEMIN=1.",
  },
];

/** Pomůcka pro jednotné mapování id → popisek v metrikách (`fetcher.ts`). */
export function pilotSourceLabel(id: PilotAggregatorSource["id"]): string {
  const row = PILOT_AGGREGATORS.find((s) => s.id === id);
  if (!row) throw new Error(`Unknown pilot aggregator: ${id}`);
  return row.sourceLabel;
}

/**
 * Hlídač státu API – klíčoví dopravní zadavatelé s IČO.
 * Slouží jako fallback/validační zdroj pro NEN a TenderArena profily.
 * Aktivní pouze pokud je nastaven `HLIDAC_STATU_API_TOKEN`.
 *
 * IČO ověřena proti veřejným rejstříkům / Hlídači státu (2026-04).
 * Odpovídá mřížce `.cursor/mrizka_dopravnich_zadavatelu_CZ.md` (kraje §4, města/DP §2–3).
 */
export type HlidacStatuIcoProcurer = {
  name: string;
  ico: string;
};

export const HLIDAC_STATU_PROCURERS: readonly HlidacStatuIcoProcurer[] = [
  { name: "Ministerstvo dopravy", ico: "66003008" },
  { name: "ŘSD", ico: "65993390" },
  { name: "Ředitelství vodních cest ČR", ico: "67981801" },
  { name: "Správa železnic", ico: "70994234" },
  { name: "HMP – Magistrát", ico: "00064581" },
  { name: "Kraj Vysočina", ico: "70890749" },
  { name: "Karlovarský kraj", ico: "70891168" },
  { name: "Královéhradecký kraj", ico: "70889546" },
  { name: "Jihočeský kraj", ico: "70890650" },
  { name: "Jihomoravský kraj", ico: "70888337" },
  { name: "Liberecký kraj", ico: "70891508" },
  { name: "Moravskoslezský kraj", ico: "70890692" },
  { name: "Olomoucký kraj", ico: "60609460" },
  { name: "Pardubický kraj", ico: "70892822" },
  { name: "Plzeňský kraj", ico: "70890366" },
  { name: "Středočeský kraj", ico: "70891095" },
  { name: "Ústecký kraj", ico: "70892156" },
  { name: "Zlínský kraj", ico: "70891320" },
  { name: "DPP Praha", ico: "00005886" },
  { name: "Statutární město Ostrava", ico: "00845451" },
  { name: "Statutární město Hradec Králové", ico: "00268810" },
  { name: "Statutární město České Budějovice", ico: "00244732" },
  { name: "Statutární město Olomouc", ico: "00299308" },
  { name: "Statutární město Jihlava", ico: "00286010" },
];

/**
 * XML profily, které mají při dostupném VZ API v Hlídači státu běžet jen jako fallback.
 * Cílem je snížit 429 na TenderArena/eGORDION hostech a použít stabilnější API cestu.
 */
export type HlidacPrimaryXmlFallbackCoverage = {
  xmlSourceLabel: string;
  hsProcurerName: string;
};

export const HLIDAC_PRIMARY_XML_FALLBACK_COVERAGE: readonly HlidacPrimaryXmlFallbackCoverage[] = [
  {
    xmlSourceLabel: "DPP Praha (TenderArena)",
    hsProcurerName: "DPP Praha",
  },
  {
    xmlSourceLabel: "HMP – Magistrát (TenderArena)",
    hsProcurerName: "HMP – Magistrát",
  },
  {
    xmlSourceLabel: "Jihočeský kraj (TenderArena)",
    hsProcurerName: "Jihočeský kraj",
  },
  {
    xmlSourceLabel: "Olomoucký kraj (eGORDION)",
    hsProcurerName: "Olomoucký kraj",
  },
  {
    xmlSourceLabel: "České Budějovice (eGORDION)",
    hsProcurerName: "Statutární město České Budějovice",
  },
  {
    xmlSourceLabel: "Hradec Králové (TenderArena)",
    hsProcurerName: "Statutární město Hradec Králové",
  },
  {
    xmlSourceLabel: "Ostrava (TenderArena)",
    hsProcurerName: "Statutární město Ostrava",
  },
];

export function getHlidacPrimaryXmlFallbackLabels(): readonly string[] {
  const hsNames = new Set(HLIDAC_STATU_PROCURERS.map((p) => p.name));
  return HLIDAC_PRIMARY_XML_FALLBACK_COVERAGE
    .filter((row) => hsNames.has(row.hsProcurerName))
    .map((row) => row.xmlSourceLabel);
}

