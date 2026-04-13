import { describe, expect, it } from "vitest";
import type { IngestedZakazka } from "./types";
import {
  dedupeZakazky,
  hasBlockedProcedureType,
  parseRetryAfterMs,
} from "./fetcher";

function item(overrides: Partial<IngestedZakazka>): IngestedZakazka {
  return {
    id: "id-1",
    zdroj: "source",
    nazev: "Zakazka A",
    popis: null,
    url: "https://example.test/contract/1",
    datum_publikace: "2026-01-01T00:00:00.000Z",
    datum_aktualizace: "2026-01-01T00:00:00.000Z",
    termin_podani_nabidky: null,
    disciplina: "Dopravni modelovani",
    klicova_slova: [],
    ...overrides,
  };
}

describe("hasBlockedProcedureType", () => {
  it("detects blocked direct award wording", () => {
    expect(hasBlockedProcedureType("Druh: primE zadani")).toBe(true);
  });

  it("detects blocked negotiated wording", () => {
    expect(
      hasBlockedProcedureType("Specifikace: jednaci rizeni bez uverejneni"),
    ).toBe(true);
  });

  it("returns false for ordinary procedure text", () => {
    expect(hasBlockedProcedureType("Lhuta pro podani nabidek 17.10.2025")).toBe(
      false,
    );
  });
});

describe("dedupeZakazky", () => {
  it("deduplicates URL variants by normalized URL", () => {
    const list = [
      item({ id: "a", url: "https://portal.test/path/?b=2&a=1#x" }),
      item({ id: "b", url: "https://portal.test/path?a=1&b=2" }),
    ];
    const out = dedupeZakazky(list);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("a");
  });

  it("deduplicates by stable procedure key for tender URLs", () => {
    const list = [
      item({ id: "a", url: "https://josephine.proebiz.com/cs/tender/76436/summary" }),
      item({ id: "b", url: "https://josephine.proebiz.com/en/tender/76436/summary" }),
    ];
    const out = dedupeZakazky(list);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("a");
  });
});

describe("parseRetryAfterMs", () => {
  it("parses seconds value", () => {
    expect(parseRetryAfterMs("12")).toBe(12000);
  });

  it("returns non-negative milliseconds for HTTP date", () => {
    const d = new Date(Date.now() + 30000).toUTCString();
    const ms = parseRetryAfterMs(d);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(0);
    expect(ms!).toBeLessThanOrEqual(30000);
  });

  it("returns null for invalid value", () => {
    expect(parseRetryAfterMs("n/a")).toBeNull();
  });
});
