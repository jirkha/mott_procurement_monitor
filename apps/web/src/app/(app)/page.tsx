import ZakazkyMonitorClient from "@/components/zakazky-monitor-client";
import {
  buildIrrelevantOnlyWhere,
  buildUnclassifiedBaseWhere,
  buildZakazkaWhere,
} from "@/lib/zakazka-filters";
import { getLastFullSuccessIngestFinishedAt } from "@/lib/ingestion/full-success";
import { mergeLegacyJosephineSourcesIntoCanonical } from "@/lib/merge-legacy-josephine-source";
import { prisma } from "@/lib/prisma";
import { toZakazkaListRow } from "@/lib/zakazky-map";
import type { SourceOption } from "@/types/zakazky";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const defaultListFilters = {
  includeUnclassified: false,
  includeIrrelevant: false,
} as const;

export default async function Home() {
  await mergeLegacyJosephineSourcesIntoCanonical(prisma);

  const defaultWhere = buildZakazkaWhere(defaultListFilters);

  const [
    zakazky,
    total,
    sources,
    unclassifiedTotal,
    irrelevantForCurrentMode,
    lastFullSuccessIngestFinishedAt,
  ] = await Promise.all([
    prisma.zakazka.findMany({
      where: defaultWhere,
      include: { source: true },
      orderBy: { publishedAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.zakazka.count({ where: defaultWhere }),
    prisma.source.findMany({
      where: { zakazky: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.zakazka.count({
      where: buildUnclassifiedBaseWhere({ includeIrrelevant: false }),
    }),
    prisma.zakazka.count({
      where: buildIrrelevantOnlyWhere(defaultListFilters),
    }),
    getLastFullSuccessIngestFinishedAt(prisma),
  ]);

  const rows = zakazky.map(toZakazkaListRow);
  const sourceOptions: SourceOption[] = sources.map((s: SourceOption) => ({
    id: s.id,
    name: s.name,
  }));

  return (
    <ZakazkyMonitorClient
      initialData={rows}
      initialTotal={total}
      initialPage={1}
      initialTotalPages={Math.ceil(total / PAGE_SIZE)}
      sources={sourceOptions}
      initialFacetCounts={{
        unclassifiedTotal,
        irrelevantForCurrentMode,
      }}
      initialLastFullSuccessIngestFinishedAt={
        lastFullSuccessIngestFinishedAt?.toISOString() ?? null
      }
    />
  );
}
