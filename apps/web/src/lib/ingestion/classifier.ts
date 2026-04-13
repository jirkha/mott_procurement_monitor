/**
 * Klasifikace textu zakázky podle disciplín a klíčových slov.
 * Zdroj pravdy: personal_page/.agent/specifikace_monitoringu_zakazek_CZ.md — §2 Disciplíny a klíčová slova.
 */

type DisciplinaDef = {
  /** Název v UI (shodný se selectem ve filtru). */
  name: string;
  /** Klíčová slova pro vyhledávání — malá písmena, normalizace textu je lowercase. */
  keywords: string[];
  /** Fráze, jejichž přítomnost v textu VYLUČUJE shodu s touto disciplínou. */
  negativeKeywords?: string[];
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Krátké čistě alfabetické zkratky (např. "its", "mhd") matchujeme
 * pouze jako samostatné tokeny, jinak vznikají falešné pozitivy z podřetězců.
 */
function keywordMatches(normalizedText: string, keyword: string): boolean {
  const isShortAlphaAbbrev = /^[a-z]{1,3}$/u.test(keyword);
  if (!isShortAlphaAbbrev) {
    return normalizedText.includes(keyword);
  }

  const escaped = escapeRegex(keyword);
  const tokenRegex = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`,
    "u",
  );
  return tokenRegex.test(normalizedText);
}

const GLOBAL_NEGATIVE_KEYWORDS = [
  "posuvné",
  "posuvný",
  "posuvných",
  "posuvná",
];

const DISCIPLINES: DisciplinaDef[] = [
  {
    name: "Dopravní modelování",
    keywords: [
      "dopravní model",
      "dopravního model",
      "dopravním model",
      "visum",
      "mikromodel",
      "makromodel",
      "multimodální",
      "dopravní prognóz",
      "intenzit dopravy",
      "dopravní generace",
      "quadstone",
      "emme",
    ],
    negativeKeywords: [
      "bim model",
      "statický model",
      "model budovy",
      "3d model",
      "datový model",
      "datového model",
      "obchodní model",
      "ekonomický model",
      "finanční model",
      "model rizik",
    ],
  },
  {
    name: "Dopravně-inženýrské studie",
    keywords: [
      "dopravně inženýrsk",
      "dopravně-inženýrsk",
      "kapacitní posouzení",
      "studie proveditelnosti",
      "posouzení vlivů na dopravu",
      "posouzení dopravních",
      "dopravní průzkum",
      "sčítání dopravy",
      "eia",
      "sea",
      "dopravní studie",
      "dopravní řešení",
      "dopravní opatření",
      "komunikační objekt",
      "dopravní infrastruktur",
      "územní souhlas",
    ],
    negativeKeywords: [
      "posuvné",
      "posuvný",
    ],
  },
  {
    name: "Veřejná doprava",
    keywords: [
      "mhd",
      "jízdní řád",
      "ids",
      "idos",
      "dopravní podnik",
      "trolejbus",
      "tramvaj",
      "autobus",
      "metro",
      "lanovka",
      "linkov",
      "dopravní obslužnost",
      "dopravní obslužnost území",
      "dohoda s dopravci",
      "přestupní",
      "železniční",
      "vlak",
      "kolejov",
      "příměstsk",
      "integrovaný dopravní systém",
      "nádraž",
      "terminál",
      "elektrobus",
      "tarifní integrac",
      "dopravce",
    ],
  },
  {
    name: "Cyklo a pěší doprava",
    keywords: [
      "cyklo",
      "cyklostezka",
      "cyklistick",
      "pěší",
      "prostupnost",
      "bezbariérov",
      "chodník",
    ],
  },
  {
    name: "Udržitelná mobilita",
    keywords: [
      "plán udržitelné městské mobility",
      "sump",
      "mobilita",
      "plán mobility",
      "plán dopravy",
      "koncepce dopravy",
      "nízkoemisní zón",
    ],
    negativeKeywords: ["mobilní telefon", "mobilní aplikac"],
  },
  {
    name: "ITS a telematika",
    keywords: [
      "its",
      "ssz",
      "telematik",
      "světelná signalizac",
      "řízení dopravy",
      "semafor",
      "dopravní řídicí",
    ],
  },
  {
    name: "Parkování",
    keywords: [
      "p+r",
      "kiss and ride",
      "parkování",
      "parkovací",
      "parkovišt",
      "záchytné parkov",
    ],
  },
  {
    name: "Bezpečnost silničního provozu",
    keywords: [
      "bezpečnostní audit komunikac",
      "bezpečnostní inspekce",
      "audit bezpečnosti pozemní",
      "audit bozp",
      "nehodov",
      "bodové závad",
      "dopravní nehod",
      "bezpečnost silnič",
      "bezpečnost provozu na pozem",
    ],
    negativeKeywords: [
      "finanční audit",
      "forenzní audit",
      "vodní audit",
      "auditpro",
      "energetický audit",
      "it audit",
      "informační bezpečnost",
      "kybernetick",
    ],
  },
];

export function classify(text: string): {
  disciplina: string | null;
  klicova_slova: string[];
} {
  const normalized = text.toLowerCase();

  const globalNeg = GLOBAL_NEGATIVE_KEYWORDS.some((neg) =>
    normalized.includes(neg),
  );

  let bestMatch: string | null = null;
  let maxMatches = 0;
  const foundKeywords: string[] = [];

  for (const d of DISCIPLINES) {
    if (d.negativeKeywords?.some((neg) => normalized.includes(neg))) continue;

    const matches = d.keywords.filter((kw) => keywordMatches(normalized, kw));

    if (matches.length > 0 && !globalNeg) {
      foundKeywords.push(...matches);
      if (matches.length > maxMatches) {
        maxMatches = matches.length;
        bestMatch = d.name;
      }
    }
  }

  const klicova_slova = Array.from(new Set(foundKeywords));

  return {
    disciplina: bestMatch,
    klicova_slova,
  };
}

/** Export pro budoucí synchronizaci s adminem / DB (seed disciplín). */
export const DISCIPLINE_DEFINITIONS = DISCIPLINES.map((d) => ({
  name: d.name,
  keywords: [...d.keywords],
}));
