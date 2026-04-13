import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ZakazkaDataFreshness from "@/components/zakazka-data-freshness";
import ZakazkaPublishedLine from "@/components/zakazka-published-line";
import ZakazkaStatusActions from "@/components/zakazka-status-actions";
import { prisma } from "@/lib/prisma";
import { toZakazkaListRow } from "@/lib/zakazky-map";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const z = await prisma.zakazka.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!z) return { title: "Zakázka — MOTT" };
  return { title: `${z.title.slice(0, 60)} — MOTT` };
}

export default async function ZakazkaDetailPage({ params }: Props) {
  const { id } = await params;
  const row = await prisma.zakazka.findUnique({
    where: { id },
    include: { source: true },
  });
  if (!row) notFound();

  const z = toZakazkaListRow(row);

  return (
    <article className="space-y-6">
      <p className="text-sm text-slate-500">
        <Link href="/" className="text-blue-700 hover:text-blue-600">
          ← Přehled zakázek
        </Link>
      </p>

      <header className="space-y-3 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
          {z.nazev}
        </h1>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Zdroj: {z.zdroj}
        </p>
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          {z.datum_publikace ? (
            <ZakazkaPublishedLine iso={z.datum_publikace} dateStyle="medium" />
          ) : (
            <span className="font-semibold text-red-600">
              Termín není k dispozici
            </span>
          )}
          {z.termin_podani_nabidky ? (
            <span className="font-medium text-slate-800">
              Lhůta pro podání nabídky:{" "}
              {new Date(z.termin_podani_nabidky).toLocaleString("cs-CZ", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : (
            z.datum_publikace && (
              <span className="font-medium text-amber-700">
                Lhůtu podání se nepodařilo dohledat.
              </span>
            )
          )}
        </div>
        <ZakazkaDataFreshness
          naposledy_stazeno={z.naposledy_stazeno}
          naposledy_upraveno_zaznamu={z.naposledy_upraveno_zaznamu}
          datum_aktualizace={z.datum_aktualizace}
        />
        <p>
          <a
            href={z.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-700"
          >
            Otevřít u zadavatele / na portálu ↗
          </a>
        </p>
      </header>

      <ZakazkaStatusActions zakazkaId={z.id} initialStatus={z.status} />

      {z.disciplina && (
        <p>
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">
            {z.disciplina}
          </span>
        </p>
      )}

      {z.klicova_slova.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {z.klicova_slova.map((k) => (
            <span
              key={k}
              className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
            >
              #{k}
            </span>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Popis</h2>
        {z.popis ? (
          <p className="whitespace-pre-wrap text-slate-700">{z.popis}</p>
        ) : (
          <p className="text-slate-500">Popis není k dispozici.</p>
        )}
      </section>
    </article>
  );
}
