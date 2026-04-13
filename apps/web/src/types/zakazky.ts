/** Tvar dat pro UI — odpovídá demo `Zakazka` z původní aplikace (název polí v češtině). */

export type ZakazkaListRow = {
  id: string;
  zdroj: string;
  nazev: string;
  popis: string | null;
  url: string;
  datum_publikace: string | null;
  datum_aktualizace: string | null;
  /** ISO čas posledního úspěšného stažení řádku při ingestu (null u starších záznamů). */
  naposledy_stazeno: string | null;
  /** ISO čas poslední změny řádku v DB (@updatedAt) — fallback pro čerstvost a zobrazení. */
  naposledy_upraveno_zaznamu: string | null;
  /** Konec lhůty pro podání nabídky (ISO), pokud je znám. */
  termin_podani_nabidky: string | null;
  disciplina: string | null;
  klicova_slova: string[];
  status: "NEW" | "IN_PROGRESS" | "CLOSED" | "IRRELEVANT";
};

export type ZakazkyApiResponse = {
  data: ZakazkaListRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SourceOption = {
  id: string;
  name: string;
};

/** Odpověď GET `/api/zakazky/filter-counts` — počty pro popisky filtrů. */
export type ZakazkyFilterCountsResponse = {
  unclassifiedTotal: number;
  irrelevantForCurrentMode: number;
};
