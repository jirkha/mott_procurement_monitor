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
  let canonical;
  try {
    canonical = await prisma.source.findUnique({ where: { slug: canonicalSlug } });
  } catch (e) {
    // #region agent log
    const err = e as { name?: string; message?: string; code?: string };
    fetch("http://127.0.0.1:7650/ingest/16c7ab11-054f-481f-a5d7-92fab7987611", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7de2c9" },
      body: JSON.stringify({
        sessionId: "7de2c9",
        location: "merge-legacy-josephine-source.ts:findUnique",
        message: "prisma.source.findUnique failed",
        data: {
          name: err?.name,
          code: err?.code,
          msgPrefix: typeof err?.message === "string" ? err.message.slice(0, 120) : String(e),
        },
        timestamp: Date.now(),
        hypothesisId: "H1-H3-H4",
      }),
    }).catch(() => {});
    // #endregion
    throw e;
  }
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
