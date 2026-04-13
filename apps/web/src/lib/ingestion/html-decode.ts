/**
 * Dekódování běžných HTML entit před regex parsováním českého textu z portálů (E‑ZAK, TA, …).
 * Pořadí: číselné entity, pojmenované z mapy, nakonec &amp; → &.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  yacute: "ý",
  scaron: "š",
  ccaron: "č",
  rcaron: "ř",
  zcaron: "ž",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
};

export function decodeHtmlEntities(input: string): string {
  let s = input
    .replace(/&#x([0-9a-fA-F]+);/gi, (full, h: string) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : full;
    })
    .replace(/&#(\d+);/g, (full, d: string) => {
      const code = parseInt(d, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : full;
    });

  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (full, name: string) => {
    return NAMED_ENTITIES[name.toLowerCase()] ?? full;
  });

  s = s.replace(/&amp;/gi, "&");
  return s;
}
