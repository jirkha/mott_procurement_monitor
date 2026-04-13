import { describe, expect, it } from "vitest";
import { ZakazkaStatus } from "@prisma/client";
import { toZakazkaListRow } from "./zakazky-map";

function baseRow(overrides: Partial<Parameters<typeof toZakazkaListRow>[0]> = {}) {
  return {
    id: "z1",
    title: "Test",
    description: null,
    sourceUrl: "https://example.com",
    publishedAt: null,
    deadline: null,
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    disciplina: null,
    keywords: [],
    recordUpdatedAt: null,
    lastFetchedAt: null,
    status: ZakazkaStatus.NEW,
    source: { name: "Unknown source", baseUrl: "https://example.com" },
    ...overrides,
  };
}

describe("toZakazkaListRow", () => {
  it("maps broken non-NEN nen.nipez detail links to source landing", () => {
    const out = toZakazkaListRow(
      baseRow({
        sourceUrl: "https://nen.nipez.cz/verejne-zakazky/detail-zakazky/VZ0245508",
        source: {
          name: "DPP Praha (TenderArena)",
          baseUrl: "https://www.tenderarena.cz",
        },
      }),
    );

    expect(out.url).toBe("https://www.tenderarena.cz/profily/DPP");
  });

  it("prefers TenderArena tender detail URL from raw payload", () => {
    const out = toZakazkaListRow(
      baseRow({
        sourceUrl: "https://www.tenderarena.cz/profily/JihoceskyKraj",
        source: {
          name: "Jihočeský kraj (TenderArena)",
          baseUrl: "https://www.tenderarena.cz",
        },
        rawPayload: {
          casti_vz: [
            {
              cast_zakazky: [
                {
                  odkaz: [
                    "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
                  ],
                },
              ],
            },
          ],
        },
      }),
    );

    expect(out.url).toBe(
      "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
    );
  });

  it("prefers TenderArena tender detail URL even when stored URL is broken NEN link", () => {
    const out = toZakazkaListRow(
      baseRow({
        sourceUrl: "https://nen.nipez.cz/verejne-zakazky/detail-zakazky/VZ0245175",
        source: {
          name: "Jihočeský kraj (TenderArena)",
          baseUrl: "https://www.tenderarena.cz",
        },
        rawPayload: {
          odkaz: [
            "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
          ],
        },
      }),
    );

    expect(out.url).toBe(
      "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
    );
  });

  it("extracts TenderArena tender detail URL from HTML snippet in raw payload", () => {
    const out = toZakazkaListRow(
      baseRow({
        sourceUrl: "https://www.tenderarena.cz/profily/JihoceskyKraj",
        source: {
          name: "Jihočeský kraj (TenderArena)",
          baseUrl: "https://www.tenderarena.cz",
        },
        rawPayload: {
          note:
            '<a href="https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100">detail</a>',
        },
      }),
    );

    expect(out.url).toBe(
      "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
    );
  });

  it("maps lastFetchedAt to naposledy_stazeno as ISO", () => {
    const t = new Date("2026-04-10T14:30:00.000Z");
    const out = toZakazkaListRow(
      baseRow({
        lastFetchedAt: t,
      }),
    );
    expect(out.naposledy_stazeno).toBe("2026-04-10T14:30:00.000Z");
  });

  it("maps updatedAt to naposledy_upraveno_zaznamu as ISO", () => {
    const out = toZakazkaListRow(baseRow());
    expect(out.naposledy_upraveno_zaznamu).toBe("2026-04-09T00:00:00.000Z");
  });

  it("keeps NEN links for NEN sources", () => {
    const url = "https://nen.nipez.cz/verejne-zakazky/detail-zakazky/N006-26-V00000928";
    const out = toZakazkaListRow(
      baseRow({
        sourceUrl: url,
        source: { name: "NEN – MDCR", baseUrl: "https://nen.nipez.cz" },
      }),
    );

    expect(out.url).toBe(url);
  });
});
