import ZakazkyMonitorClient from "@/components/zakazky-monitor-client";
import {
  buildIrrelevantOnlyWhere,
  buildUnclassifiedBaseWhere,
  buildZakazkaWhere,
} from "@/lib/zakazka-filters";
import { getLastFullSuccessIngestFinishedAt } from "@/lib/ingestion/full-success";
import { mergeLegacyJosephineSourcesIntoCanonical } from "@/lib/merge-legacy-josephine-source";
import { prisma } from "@/lib/prisma";
import { isSqliteDatabaseUrl } from "@/lib/resolve-database-url";
import { toZakazkaListRow } from "@/lib/zakazky-map";
import type { SourceOption } from "@/types/zakazky";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const defaultListFilters = {
  includeUnclassified: false,
  includeIrrelevant: false,
} as const;

export default async function Home() {
  try {
    await prisma.$connect();
  } catch {
    const url = process.env.DATABASE_URL;
    const sqlite = isSqliteDatabaseUrl(url);

    if (sqlite) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-slate-900 shadow-sm">
          <h1 className="text-lg font-semibold text-amber-900">Databáze není dostupná</h1>
          <p className="mt-2 text-sm text-slate-700">
            Nelze použít lokální SQLite ({url ? (
              <code className="rounded bg-white px-1">{url}</code>
            ) : (
              "file:./dev.db"
            )}
            ). Nejčastěji chybí migrace nebo soubor není zapisovatelný.
          </p>
          <p className="mt-3 text-sm text-slate-700">Z kořene monorepa spusťte:</p>
          <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800">
            npm run db:migrate
          </pre>
          <p className="mt-3 text-xs text-slate-600">
            SQLite soubor vznikne v{" "}
            <code className="rounded bg-white px-1">packages/db/prisma/sqlite/dev.db</code>.{" "}
            Výchozí <code className="rounded bg-white px-1">DATABASE_URL</code> je v{" "}
            <code className="rounded bg-white px-1">packages/db/.env</code> (viz{" "}
            <code className="rounded bg-white px-1">packages/db/.env.example</code>). Poté znovu načtěte
            stránku.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-slate-900 shadow-sm">
        <h1 className="text-lg font-semibold text-amber-900">Databáze není dostupná</h1>
        <p className="mt-2 text-sm text-slate-700">
          Nelze se připojit k PostgreSQL (např. na <code className="rounded bg-white px-1">localhost:5432</code>
          ). Zvolte jednu z možností:
        </p>
        <ul className="mt-3 list-inside list-decimal space-y-3 text-sm text-slate-700">
          <li>
            <span className="font-medium text-slate-800">Docker</span> (musí být nainstalovaný a v PATH — na
            Windows typicky{" "}
            <a
              className="text-blue-700 underline hover:text-blue-900"
              href="https://docs.docker.com/desktop/setup/install/windows-install/"
              rel="noreferrer"
              target="_blank"
            >
              Docker Desktop
            </a>
            ). Z kořene repozitáře:
            <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800">
              docker compose up -d
            </pre>
          </li>
          <li>
            <span className="font-medium text-slate-800">PostgreSQL bez Dockeru</span> (např. WSL/Ubuntu):
            nainstalujte server, spusťte službu a vytvořte uživatele a DB odpovídající{" "}
            <code className="rounded bg-white px-1">DATABASE_URL</code> (uživatel{" "}
            <code className="rounded bg-white px-1">mott</code>, databáze{" "}
            <code className="rounded bg-white px-1">mott_dev</code>, port{" "}
            <code className="rounded bg-white px-1">5432</code>).
            <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
              {`sudo apt update && sudo apt install -y postgresql
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER mott WITH PASSWORD 'mott' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE mott_dev OWNER mott;"`}
            </pre>
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-600">
          Poté spusťte migrace z kořene repozitáře (
          <code className="rounded bg-white px-1">npm run db:migrate</code>
          ), ověřte <code className="rounded bg-white px-1">DATABASE_URL</code> a znovu načtěte stránku.
        </p>
      </div>
    );
  }

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
