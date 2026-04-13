import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Zdroje — MOTT",
  description: "Přehled napojených zdrojů zakázek",
};

export const dynamic = "force-dynamic";

export default async function SpravaZdrojePage() {
  const sources = await prisma.source.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { zakazky: true } },
    },
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        <Link href="/sprava" className="text-blue-700 hover:text-blue-600">
          ← Správa
        </Link>
      </p>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Zdroje</h1>
        <p className="mt-2 text-slate-600">
          Registrované zdroje v databázi a počet zakázek podle zdroje (včetně
          nekategorizovaných).
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          Zatím žádné zdroje. Spusťte sběr tlačítkem <strong>Aktualizovat</strong>{" "}
          na přehledu zakázek.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">
                  Slug: <code className="rounded bg-slate-100 px-1">{s.slug}</code>{" "}
                  · {s.kind}
                  {s.baseUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        href={s.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        web ↗
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="text-sm tabular-nums text-slate-700">
                <span className="font-semibold">{s._count.zakazky}</span>{" "}
                záznamů
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
