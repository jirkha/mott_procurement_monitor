import { describe, expect, it } from "vitest";
import { resolveZakazkaFreshness } from "./zakazka-data-freshness-resolve";

const FORBIDDEN = "Stažení do aplikace není evidováno";

describe("resolveZakazkaFreshness", () => {
  const now = new Date("2026-04-13T12:00:00.000Z");

  it("uses lastFetched when set and does not append DB suffix", () => {
    const v = resolveZakazkaFreshness({
      naposledy_stazeno: "2026-04-13T10:00:00.000Z",
      naposledy_upraveno_zaznamu: "2026-04-01T00:00:00.000Z",
      datum_aktualizace: "2026-04-12T00:00:00.000Z",
      now,
    });
    expect(v.badgeKind).toBe("current");
    expect(v.primarySuffix).toBe("");
    expect(v.fromExplicitFetch).toBe(true);
    expect(JSON.stringify(v)).not.toContain(FORBIDDEN);
  });

  it("falls back to updatedAt with suffix when lastFetched missing", () => {
    const v = resolveZakazkaFreshness({
      naposledy_stazeno: null,
      naposledy_upraveno_zaznamu: "2026-04-13T10:00:00.000Z",
      datum_aktualizace: "2026-04-12T08:00:00.000Z",
      now,
    });
    expect(v.badgeKind).toBe("current");
    expect(v.primarySuffix).toContain("poslední změna záznamu v aplikaci");
    expect(v.fromExplicitFetch).toBe(false);
    expect(v.sourceSubline).toContain("Aktualizace ve zdroji");
    expect(JSON.stringify(v)).not.toContain(FORBIDDEN);
  });

  it("unknown when both times missing", () => {
    const v = resolveZakazkaFreshness({
      naposledy_stazeno: null,
      naposledy_upraveno_zaznamu: null,
      datum_aktualizace: null,
      now,
    });
    expect(v.badgeKind).toBe("unknown");
    expect(v.primaryTimeLabel).toContain("ověřit");
  });
});
