import type { PrismaClient } from "@prisma/client";
import { ACTIVE_AGGREGATORS } from "@/lib/ingestion/source-config";

function slugifyDisplayName(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "unknown-source";
}

/**
 * Sloučí starý zdroj „JOSEPHINE (pilot)“ do kanonického JOSEPHINE (stejný slug jako v ingestu).
 */
export async function mergeLegacyJosephineSourcesIntoCanonical(prisma: PrismaClient) {
  const josephine = ACTIVE_AGGREGATORS.find((a) => a.id === "josephine");
  if (!josephine) return;

  const canonicalSlug = slugifyDisplayName(josephine.sourceLabel);
  const canonical = await prisma.source.findUnique({ where: { slug: canonicalSlug } });
  if (!canonical) return;

  const legacy = await prisma.source.findMany({
    where: {
      id: { not: canonical.id },
      OR: [{ slug: "josephine-pilot" }, { name: "JOSEPHINE (pilot)" }],
    },
  });

  for (const src of legacy) {
    const rows = await prisma.zakazka.findMany({
      where: { sourceId: src.id },
      select: { id: true, externalRef: true },
    });
    for (const z of rows) {
      if (z.externalRef == null) {
        await prisma.zakazka.update({
          where: { id: z.id },
          data: { sourceId: canonical.id },
        });
        continue;
      }
      const twin = await prisma.zakazka.findFirst({
        where: { sourceId: canonical.id, externalRef: z.externalRef },
        select: { id: true },
      });
      if (twin) {
        await prisma.zakazka.delete({ where: { id: z.id } });
      } else {
        await prisma.zakazka.update({
          where: { id: z.id },
          data: { sourceId: canonical.id },
        });
      }
    }
    await prisma.source.delete({ where: { id: src.id } });
  }
}
