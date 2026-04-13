import { decodeHtmlEntities } from "./html-decode";

/**
 * Společné parsování lhůt z HTML veřejných portálů (E‑ZAK, Tender Arena, …).
 * Priorita: podání nabídky → žádost o účast / doručení žádosti → obecná „lhůta pro podání nabídek“.
 */

const CZ_DATE_CAPTURE =
  "(\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?)";

/** Plain text vhodný pro regexy (entity dekódované). */
export function htmlToCzPortalPlainText(html: string): string {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  t = decodeHtmlEntities(t);
  return t
    .replace(/\u00A0|\u202F/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Datum/čas z řetězce typu „23.03.2026 10:00“ nebo „05. 03. 2026 10:00:00“ (mezerami po tečkách). */
export function parseCzDeadlineDateToken(s: string): Date | null {
  const t = s.trim().replace(/\s+/g, " ");
  const m =
    /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      t,
    );
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const y = m[3];
  if (m[4] != null && m[5] != null) {
    const h = m[4].padStart(2, "0");
    const min = m[5].padStart(2, "0");
    const sec = (m[6] ?? "0").padStart(2, "0");
    const date = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(sec),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

type PatternSpec = { re: RegExp; group: number };

function firstMatchDate(
  plain: string,
  specs: PatternSpec[],
): Date | null {
  for (const { re, group } of specs) {
    const m = re.exec(plain);
    if (!m?.[group]) continue;
    const d = parseCzDeadlineDateToken(m[group]);
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Lhůty podání nabídky (primární). */
const NABIDKA_PATTERNS: PatternSpec[] = [
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+pod[aá]n[ií]\\s+nab[ií]d[eé]k\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+doru[cč]en[ií]\\s+nab[ií]d[eé]k\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `nab[íi]dk[uy]\\s+podat\\s+do\\s*:\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `nab[íi]dk[uy]\\s+podat\\s+do\\s+${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `nab[íi]dk[uy]\\s+pod[aá]vat\\s+do\\s*:\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `\\bnab[íi]dk[uy]\\s+podat\\s+do[\\s:]*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
];

/** Žádost o účast / předběžná přihláška (sekundární — když chybí nabídka). */
const ZADOST_PATTERNS: PatternSpec[] = [
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+doru[cč]en[ií]\\s+ž[aá]dost[ií]\\s+o\\s+ú[cč]ast\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+doru[cč]en[ií]\\s+ž[aá]dosti\\s+o\\s+ú[cč]ast\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `ž[aá]dost[ií]\\s+o\\s+ú[cč]ast\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+pod[aá]n[ií]\\s+ž[aá]dosti\\s+o\\s+ú[cč]ast\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+pod[aá]n[ií]\\s+ž[aá]dost[ií]\\s+o\\s+ú[cč]ast\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
];

/** Josephine / obecné dt/dd texty. */
const GENERIC_NABIDKA_PATTERNS: PatternSpec[] = [
  {
    re: new RegExp(
      `lh[uů]ta\\s+pro\\s+pod[aá]n[ií]\\s+nab[ií]d[eé]k[aáyý]*\\s*:?\\s*${CZ_DATE_CAPTURE}`,
      "i",
    ),
    group: 1,
  },
];

export function extractSubmissionDeadlineFromCzPortalPlainText(
  plain: string,
): Date | null {
  return (
    firstMatchDate(plain, NABIDKA_PATTERNS) ??
    firstMatchDate(plain, ZADOST_PATTERNS) ??
    firstMatchDate(plain, GENERIC_NABIDKA_PATTERNS)
  );
}

export function parseDeadlineFromCzPortalHtml(html: string): Date | null {
  return extractSubmissionDeadlineFromCzPortalPlainText(
    htmlToCzPortalPlainText(html),
  );
}
