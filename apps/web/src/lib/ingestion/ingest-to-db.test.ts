import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { persistIngestedZakazky } from "./ingest-to-db";
import type { IngestedZakazka } from "./types";

const minimalItem: IngestedZakazka = {
  id: "ext-1",
  zdroj: "Test Source One",
  nazev: "Zakázka",
  popis: null,
  url: "https://example.com/z",
  datum_publikace: null,
  datum_aktualizace: null,
  termin_podani_nabidky: null,
  disciplina: null,
  klicova_slova: [],
};

describe("persistIngestedZakazky", () => {
  it("nastaví lastFetchedAt při create i update", async () => {
    const sourceUpsert = vi.fn().mockResolvedValue({ id: "sid1" });
    const zakazkaUpsert = vi.fn().mockResolvedValue({ id: "zid1" });
    const prisma = {
      source: { upsert: sourceUpsert },
      zakazka: { upsert: zakazkaUpsert },
    } as unknown as PrismaClient;

    await persistIngestedZakazky(prisma, [minimalItem]);

    expect(zakazkaUpsert).toHaveBeenCalledTimes(1);
    const arg = zakazkaUpsert.mock.calls[0][0] as {
      create: { lastFetchedAt: Date };
      update: { lastFetchedAt: Date };
    };
    expect(arg.create.lastFetchedAt).toBeInstanceOf(Date);
    expect(arg.update.lastFetchedAt).toBeInstanceOf(Date);
    expect(arg.create.lastFetchedAt.getTime()).toBe(
      arg.update.lastFetchedAt.getTime(),
    );
  });
});
