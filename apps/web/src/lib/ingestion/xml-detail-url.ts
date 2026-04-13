/**
 * Veřejná URL detailu zakázky z XML profilu (NEN / PROEBIZ / TenderArena / …).
 * PROEBIZ často uvádí v dokumentech jen /tender/{číslo}/attachments/… — veřejná karta je /verejne-zakazky/{číslo}.
 * Systémové číslo P26V… do šablony /verejne-zakazky/{id} nepatří (404).
 */

export type XmlDetailUrlOpts = {
  url: string;
  detailUrlTemplate?: string;
  xmlBaseUrl?: string;
  isNenProfile?: boolean;
};

function getHostnameSafe(input: string | undefined): string {
  if (!input) return "";
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function xml2jsList(node: unknown): unknown[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

/** Rekurzivně najde všechny řetězce vypadající jako http(s) URL (xml2js struktura). */
export function collectHttpUrlsFromUnknown(node: unknown, out: string[], depth = 0): void {
  if (depth > 40 || out.length > 500) return;
  if (typeof node === "string") {
    const s = node.trim();
    if (/^https?:\/\//i.test(s)) out.push(s);
    // Některé XML pole nesou HTML snippet (např. <a href="...">), ne čisté URL.
    const matches = s.match(/https?:\/\/[^\s"'<>]+/gi);
    if (matches) {
      for (const m of matches) {
        out.push(m.replace(/&amp;/g, "&"));
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectHttpUrlsFromUnknown(x, out, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectHttpUrlsFromUnknown(v, out, depth + 1);
    }
  }
}

export function extractLikelyUrlCandidatesFromRecord(
  z: Record<string, unknown[]>,
): string[] {
  const out: string[] = [];
  for (const [key, raw] of Object.entries(z)) {
    if (!/url|odkaz/i.test(key)) continue;
    for (const one of xml2jsList(raw)) {
      if (typeof one !== "string") continue;
      const s = one.trim();
      if (!/^https?:\/\//i.test(s)) continue;
      out.push(s);
    }
  }
  return out;
}

function deriveProfileLandingUrl(xmlBaseUrl: string | undefined): string | null {
  if (!xmlBaseUrl) return null;
  try {
    const u = new URL(xmlBaseUrl);
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\/XMLdataVZ\/?$/i, "");
    return u.toString();
  } catch {
    return null;
  }
}

/** Všechny kandidátní URL z kořene záznamu zakázky včetně vnořených dokumentů. */
export function gatherAllXmlHttpUrls(
  z: Record<string, unknown[]>,
): string[] {
  const deep: string[] = [];
  collectHttpUrlsFromUnknown(z, deep);
  const shallow = extractLikelyUrlCandidatesFromRecord(z);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const u of [...shallow, ...deep]) {
    if (seen.has(u)) continue;
    seen.add(u);
    merged.push(u);
  }
  return merged;
}

/**
 * Z libovolné PROEBIZ/JOSEPHINE URL s /tender/{id}/ vytvoří veřejnou stránku zakázky.
 */
export function proebizPublicUrlFromTenderUrl(absUrl: string): string | null {
  try {
    const u = new URL(absUrl);
    const m = u.pathname.match(/\/tender\/(\d+)\b/i);
    if (!m?.[1]) return null;
    const id = m[1];
    const host = u.hostname.toLowerCase();
    if (host.includes("josephine.proebiz.com")) {
      return `https://josephine.proebiz.com/cs/tender/${id}/summary`;
    }
    if (host.includes("profily.proebiz.com")) {
      return `https://profily.proebiz.com/verejne-zakazky/${id}`;
    }
    return `${u.origin}/verejne-zakazky/${id}`;
  } catch {
    return null;
  }
}

/** Odkaz přímo v XML (E-ZAK contract_display, NEN detail, číselné PROEBIZ karty). */
function pickDirectDetailFromCandidates(
  candidates: string[],
  opts: XmlDetailUrlOpts,
): string | null {
  const sourceHost = getHostnameSafe(opts.xmlBaseUrl ?? opts.url);
  const isNenProfileHost = sourceHost === "nen.nipez.cz";

  for (const c of candidates) {
    if (
      !/contract_display_\d+\.html|detail-zakazky\/[^/?#]+|\/verejne-zakazky\/\d+\b|\/zakazka\/\d+\b|\/tender\/\d+\/summary\b|\/seznam-profilu-zadavatelu\/detail\/z\d+\/zakazka\/\d+\b/i.test(
        c,
      )
    ) {
      continue;
    }

    const candidateHost = getHostnameSafe(c);
    // U nenipez detailu bereme odkaz jen tehdy, pokud je původní zdroj také NEN.
    // V XML jiných profilů se objevují interní identifikátory (např. VZ..., SML...),
    // které na veřejném detailu NEN končí chybovou stránkou.
    if (
      candidateHost === "nen.nipez.cz" &&
      /detail-zakazky\/[^/?#]+/i.test(c) &&
      !isNenProfileHost
    ) {
      continue;
    }

    return c;
  }

  return null;
}

export function resolveXmlDetailUrl(
  z: Record<string, unknown[]>,
  opts: XmlDetailUrlOpts,
  linkId: string,
): string {
  const candidates = gatherAllXmlHttpUrls(z);
  for (const c of candidates) {
    const pub = proebizPublicUrlFromTenderUrl(c);
    if (pub) return pub;
  }

  const picked = pickDirectDetailFromCandidates(candidates, opts);
  if (picked) return picked;

  if (opts.detailUrlTemplate && linkId && !/^P\d+V/i.test(linkId)) {
    return opts.detailUrlTemplate.replace(
      "{id}",
      encodeURIComponent(linkId || "unknown"),
    );
  }
  if (opts.isNenProfile) {
    return `https://nen.nipez.cz/verejne-zakazky/detail-zakazky/${linkId || "unknown"}`;
  }
  return deriveProfileLandingUrl(opts.xmlBaseUrl) ?? opts.url;
}
