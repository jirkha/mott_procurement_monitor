import { describe, expect, it } from "vitest";
import { enrichDeadlinesBySharedProcedureKey } from "./procedure-deadline-merge";
import type { IngestedZakazka } from "./types";

function baseItem(
  partial: Partial<IngestedZakazka> & Pick<IngestedZakazka, "id" | "nazev" | "url">,
): IngestedZakazka {
  return {
    zdroj: "test",
    popis: null,
    datum_publikace: null,
    datum_aktualizace: null,
    termin_podani_nabidky: null,
    disciplina: "x",
    klicova_slova: [],
    ...partial,
  };
}

describe("enrichDeadlinesBySharedProcedureKey", () => {
  it("doplní lhůtu z jiné položky se stejným P…V…", () => {
    const d = "2026-03-23T10:00:00.000Z";
    const items: IngestedZakazka[] = [
      baseItem({
        id: "a",
        nazev: "Cyklostezka",
        url: "https://vvz.example/item",
        popis: "Ref P26V00000027",
        termin_podani_nabidky: null,
      }),
      baseItem({
        id: "b",
        nazev: "Cyklostezka",
        url: "https://zakazky.jihlava.cz/contract_display_316.html",
        popis: `Systémové číslo: P26V00000027`,
        termin_podani_nabidky: d,
      }),
    ];
    enrichDeadlinesBySharedProcedureKey(items);
    expect(items[0].termin_podani_nabidky).toBe(d);
    expect(items[1].termin_podani_nabidky).toBe(d);
  });

  it("nezmění položku bez shody systémového čísla", () => {
    const items: IngestedZakazka[] = [
      baseItem({
        id: "a",
        nazev: "Jiná",
        url: "https://a",
        termin_podani_nabidky: null,
      }),
      baseItem({
        id: "b",
        nazev: "X",
        url: "https://b",
        termin_podani_nabidky: "2026-01-01T12:00:00.000Z",
      }),
    ];
    enrichDeadlinesBySharedProcedureKey(items);
    expect(items[0].termin_podani_nabidky).toBeNull();
  });
});
