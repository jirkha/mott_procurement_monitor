/** Normalizovaný záznam zakázky ze sběru (stejný význam jako v původním demu). */

export type IngestedZakazka = {
  id: string;
  zdroj: string;
  nazev: string;
  popis: string | null;
  url: string;
  /** Datum zveřejnění / zahájení ze zdroje (ISO), pokud je známo. */
  datum_publikace: string | null;
  /** Poslední úřední / dokumentové datum ze zdroje (ISO), jinak null. */
  datum_aktualizace: string | null;
  /** Konec lhůty pro podání nabídky (ISO), pokud je ze zdroje známo. */
  termin_podani_nabidky: string | null;
  disciplina: string | null;
  klicova_slova: string[];
};
