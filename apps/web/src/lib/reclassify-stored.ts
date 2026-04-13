import type { PrismaClient } from "@prisma/client";
import { classify } from "@/lib/ingestion/classifier";

export type ReclassifyStats = {
  total: number;
  updated: number;
  setToNull: number;
  durationsMs?: {
    fetchRows: number;
    updateRows: number;
    total: number;
  };
};

const BATCH_SIZE = 200;

/** Přepočítá disciplínu a klíčová slova u všech uložených zakázek (aktuální pravidla v classifier). */
export async function reclassifyAllStoredZakazky(
  prisma: PrismaClient,
  opts?: { onlyIds?: string[] },
): Promise<ReclassifyStats> {
  const startedAt = Date.now();
  const where =
    opts?.onlyIds && opts.onlyIds.length > 0
      ? { id: { in: opts.onlyIds } }
      : undefined;

  const fetchStartedAt = Date.now();
  const rows = await prisma.zakazka.findMany({
    where,
    select: { id: true, title: true, description: true },
  });
  const fetchRowsMs = Date.now() - fetchStartedAt;

  let updated = 0;
  let setToNull = 0;
  const updateStartedAt = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((row) => {
        const { disciplina, klicova_slova } = classify(
          `${row.title} ${row.description ?? ""}`,
        );
        if (!disciplina) setToNull++;
        updated++;
        return prisma.zakazka.update({
          where: { id: row.id },
          data: { disciplina, keywords: klicova_slova },
        });
      }),
    );
  }

  const updateRowsMs = Date.now() - updateStartedAt;
  const totalMs = Date.now() - startedAt;
  return {
    total: rows.length,
    updated,
    setToNull,
    durationsMs: {
      fetchRows: fetchRowsMs,
      updateRows: updateRowsMs,
      total: totalMs,
    },
  };
}
