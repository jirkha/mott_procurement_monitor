import type { IngestedZakazka } from "./types";

/** Systémové číslo veřejné zakázky (např. P26V00000027) v textu zdroje. */
const PROCEDURE_ID_RE = /\b(P\d{2}[A-Z]\d{7,})\b/gi;

function forEachProcedureId(blob: string, fn: (id: string) => void): void {
  const re = new RegExp(PROCEDURE_ID_RE.source, PROCEDURE_ID_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    fn(m[1].toUpperCase());
  }
}

/**
 * Položky se stejným systémovým číslem (např. VVZ vs E‑ZAK) sdílí nejbližší známou lhůtu.
 * Mutuje `items` — volat před deduplikací podle URL.
 */
export function enrichDeadlinesBySharedProcedureKey(
  items: IngestedZakazka[],
): void {
  const byKey = new Map<string, string>();
  for (const it of items) {
    if (!it.termin_podani_nabidky) continue;
    const blob = `${it.nazev} ${it.popis ?? ""} ${it.url}`;
    const tNew = new Date(it.termin_podani_nabidky).getTime();
    forEachProcedureId(blob, (k) => {
      const cur = byKey.get(k);
      if (
        !cur ||
        tNew < new Date(cur).getTime()
      ) {
        byKey.set(k, it.termin_podani_nabidky!);
      }
    });
  }

  for (const it of items) {
    if (it.termin_podani_nabidky) continue;
    const blob = `${it.nazev} ${it.popis ?? ""} ${it.url}`;
    let best: string | null = null;
    let bestTs = Infinity;
    forEachProcedureId(blob, (k) => {
      const iso = byKey.get(k);
      if (!iso) return;
      const ts = new Date(iso).getTime();
      if (ts < bestTs) {
        bestTs = ts;
        best = iso;
      }
    });
    if (best) it.termin_podani_nabidky = best;
  }
}
