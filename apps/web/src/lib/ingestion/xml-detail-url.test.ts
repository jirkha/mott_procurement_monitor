import { describe, expect, it } from "vitest";
import {
  proebizPublicUrlFromTenderUrl,
  resolveXmlDetailUrl,
} from "./xml-detail-url";

describe("proebizPublicUrlFromTenderUrl", () => {
  it("maps profily attachment URL to verejne-zakazky", () => {
    expect(
      proebizPublicUrlFromTenderUrl(
        "https://profily.proebiz.com/tender/5761/attachments/download/1",
      ),
    ).toBe("https://profily.proebiz.com/verejne-zakazky/5761");
  });

  it("maps josephine host to /cs/tender/…/summary", () => {
    expect(
      proebizPublicUrlFromTenderUrl(
        "https://josephine.proebiz.com/tender/76436/attachments/x",
      ),
    ).toBe("https://josephine.proebiz.com/cs/tender/76436/summary");
  });
});

describe("resolveXmlDetailUrl", () => {
  const xmlBase = "https://profily.proebiz.com/profile/61974757/XMLdataVZ";
  const opts = {
    url: `${xmlBase}?od=01012026&do=01042026`,
    xmlBaseUrl: xmlBase,
    detailUrlTemplate: "https://profily.proebiz.com/verejne-zakazky/{id}",
  };

  it("uses nested /tender/{id}/ even when id_objektu is P26V…", () => {
    const z = {
      id_objektu: ["P26V00000001"],
      casti_vz: [
        {
          cast_zakazky: [
            {
              zadavaci_postup_casti: [
                {
                  dokumenty: [
                    {
                      dokument: [
                        {
                          url: [
                            "https://profily.proebiz.com/tender/5761/attachments/download/44261",
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as Record<string, unknown[]>;

    expect(resolveXmlDetailUrl(z, opts, "P26V00000001")).toBe(
      "https://profily.proebiz.com/verejne-zakazky/5761",
    );
  });

  it("does not use detailUrlTemplate for P26V… without tender URL in XML", () => {
    const z = { id_objektu: ["P26V00000099"] } as Record<string, unknown[]>;
    expect(resolveXmlDetailUrl(z, opts, "P26V00000099")).toBe(
      "https://profily.proebiz.com/profile/61974757",
    );
  });

  it("uses detailUrlTemplate for numeric id_objektu", () => {
    const z = { id_objektu: ["12345"] } as Record<string, unknown[]>;
    expect(resolveXmlDetailUrl(z, opts, "12345")).toBe(
      "https://profily.proebiz.com/verejne-zakazky/12345",
    );
  });

  it("ignores non-public NEN VZ links for TenderArena profiles", () => {
    const tenderArenaXmlBase = "https://www.tenderarena.cz/profily/DPMP/XMLdataVZ";
    const tenderArenaOpts = {
      url: `${tenderArenaXmlBase}?od=01012026&do=01042026`,
      xmlBaseUrl: tenderArenaXmlBase,
    };
    const z = {
      id_objektu: ["P26V00001234"],
      odkaz: [
        "https://nen.nipez.cz/verejne-zakazky/detail-zakazky/VZ0244376",
      ],
    } as Record<string, unknown[]>;

    expect(resolveXmlDetailUrl(z, tenderArenaOpts, "P26V00001234")).toBe(
      "https://www.tenderarena.cz/profily/DPMP",
    );
  });

  it("keeps NEN detail links only for NEN source profiles", () => {
    const nonNenXmlBase =
      "https://www.egordion.cz/nabidkaGORDION/profilOlomouckykraj/XMLdataVZ";
    const nonNenOpts = {
      url: `${nonNenXmlBase}?od=01012026&do=01042026`,
      xmlBaseUrl: nonNenXmlBase,
    };
    const z = {
      id_objektu: ["ABC-123"],
      odkaz: [
        "https://nen.nipez.cz/verejne-zakazky/detail-zakazky/CB260052",
      ],
    } as Record<string, unknown[]>;

    expect(resolveXmlDetailUrl(z, nonNenOpts, "ABC-123")).toBe(
      "https://www.egordion.cz/nabidkaGORDION/profilOlomouckykraj",
    );
  });

  it("prefers direct TenderArena zakazka detail URL when present in XML", () => {
    const tenderArenaXmlBase = "https://www.tenderarena.cz/profily/JihoceskyKraj/XMLdataVZ";
    const tenderArenaOpts = {
      url: `${tenderArenaXmlBase}?od=01012026&do=01042026`,
      xmlBaseUrl: tenderArenaXmlBase,
    };
    const z = {
      id_objektu: ["P26V00009999"],
      odkaz: [
        "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
      ],
    } as Record<string, unknown[]>;

    expect(resolveXmlDetailUrl(z, tenderArenaOpts, "P26V00009999")).toBe(
      "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
    );
  });

  it("extracts TenderArena detail URL from HTML snippet value", () => {
    const tenderArenaXmlBase = "https://www.tenderarena.cz/profily/JihoceskyKraj/XMLdataVZ";
    const tenderArenaOpts = {
      url: `${tenderArenaXmlBase}?od=01012026&do=01042026`,
      xmlBaseUrl: tenderArenaXmlBase,
    };
    const z = {
      id_objektu: ["P26V00009999"],
      poznamka: [
        '<a href="https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100">detail</a>',
      ],
    } as Record<string, unknown[]>;

    expect(resolveXmlDetailUrl(z, tenderArenaOpts, "P26V00009999")).toBe(
      "https://tenderarena.cz/dodavatel/seznam-profilu-zadavatelu/detail/Z0002739/zakazka/878100",
    );
  });

  it("accepts EVEZA zakazka detail URL shape", () => {
    const evezaXmlBase =
      "https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/XMLdataVZ";
    const evezaOpts = {
      url: `${evezaXmlBase}?od=01012026&do=01042026`,
      xmlBaseUrl: evezaXmlBase,
    };
    const z = {
      id_objektu: ["57850"],
      odkaz: [
        "https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/zakazka/57850",
      ],
    } as Record<string, unknown[]>;

    expect(resolveXmlDetailUrl(z, evezaOpts, "57850")).toBe(
      "https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/zakazka/57850",
    );
  });
});
