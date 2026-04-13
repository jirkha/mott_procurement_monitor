"use client";

import ZakazkaDataFreshness from "@/components/zakazka-data-freshness";
import ZakazkaPublishedLine from "@/components/zakazka-published-line";
import { userFacingIngestError } from "@/lib/user-facing-ingest-error";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SourceOption,
  ZakazkyFilterCountsResponse,
  ZakazkaListRow,
  ZakazkyApiResponse,
} from "@/types/zakazky";

type Props = {
  initialData: ZakazkaListRow[];
  initialTotal: number;
  initialPage: number;
  initialTotalPages: number;
  sources: SourceOption[];
  initialFacetCounts: ZakazkyFilterCountsResponse;
  /** ISO čas dokončení posledního běhu bez blokujících chyb zdrojů (kompletní sběr). */
  initialLastFullSuccessIngestFinishedAt: string | null;
};

const PAGE_SIZE = 50;

type SourceFailureItem = {
  sourceLabel: string;
  reason: string;
  staleDataVisible?: boolean;
};

function formatSourceFailureLine(f: SourceFailureItem): string {
  const tail =
    f.staleDataVisible === false
      ? "nezobrazeny zakázky"
      : "zobrazeny neaktualizované údaje";
  return `Zdroj ${f.sourceLabel} – chyba při aktualizaci ${f.reason}, ${tail}.`;
}

function buildApiUrl(params: {
  page: number;
  disciplina: string;
  q: string;
  zdroj: string;
  includeUnclassified: boolean;
  includeIrrelevant: boolean;
}) {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page));
  sp.set("limit", String(PAGE_SIZE));
  if (params.disciplina) sp.set("disciplina", params.disciplina);
  if (params.q) sp.set("q", params.q);
  if (params.zdroj) sp.set("zdroj", params.zdroj);
  if (params.includeUnclassified) sp.set("includeUnclassified", "1");
  if (params.includeIrrelevant) sp.set("includeIrrelevant", "1");
  return `/api/zakazky?${sp.toString()}`;
}

function buildFilterCountsQuery(f: ListFilters): string {
  const sp = new URLSearchParams();
  if (f.disciplina) sp.set("disciplina", f.disciplina);
  if (f.q) sp.set("q", f.q);
  if (f.zdroj) sp.set("zdroj", f.zdroj);
  if (f.includeUnclassified) sp.set("includeUnclassified", "1");
  if (f.includeIrrelevant) sp.set("includeIrrelevant", "1");
  return sp.toString();
}

type ListFilters = {
  disciplina: string;
  q: string;
  zdroj: string;
  includeUnclassified: boolean;
  includeIrrelevant: boolean;
};

function fmtCount(n: number): string {
  return n.toLocaleString("cs-CZ");
}

function formatLastFullSuccessLabel(iso: string | null): string {
  if (!iso) return "Zatím žádná kompletní aktualizace všech zdrojů.";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()))
    return "Zatím žádná kompletní aktualizace všech zdrojů.";
  const when = d.toLocaleString("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `Naposledy kompletní aktualizace všech zdrojů: ${when}`;
}

export default function ZakazkyMonitorClient({
  initialData,
  initialTotal,
  initialPage,
  initialTotalPages,
  sources,
  initialFacetCounts,
  initialLastFullSuccessIngestFinishedAt,
}: Props) {
  const [zakazky, setZakazky] = useState<ZakazkaListRow[]>(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [facetCounts, setFacetCounts] =
    useState<ZakazkyFilterCountsResponse>(initialFacetCounts);
  const [loading, setLoading] = useState(false);
  const [disciplina, setDisciplina] = useState("");
  const [q, setQ] = useState("");
  const [zdroj, setZdroj] = useState("");
  const [showUnclassified, setShowUnclassified] = useState(false);
  const [includeIrrelevant, setIncludeIrrelevant] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFullSuccessIngestFinishedAt, setLastFullSuccessIngestFinishedAt] =
    useState<string | null>(initialLastFullSuccessIngestFinishedAt);
  const [refreshFeedback, setRefreshFeedback] = useState<
    | {
        type: "info" | "success" | "error";
        text: string;
      }
    | { type: "warning"; lines: string[] }
    | null
  >(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (pageNum: number, f: ListFilters) => {
    setLoading(true);
    try {
      const url = buildApiUrl({
        page: pageNum,
        disciplina: f.disciplina,
        q: f.q,
        zdroj: f.zdroj,
        includeUnclassified: f.includeUnclassified,
        includeIrrelevant: f.includeIrrelevant,
      });
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as ZakazkyApiResponse;
      if (!Array.isArray(json.data)) return;
      setZakazky(json.data);
      setTotal(json.total);
      setPage(json.page);
      setTotalPages(json.totalPages);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFacetCounts = useCallback(async (f: ListFilters) => {
    const qs = buildFilterCountsQuery(f);
    const res = await fetch(`/api/zakazky/filter-counts?${qs}`);
    if (!res.ok) return;
    const json = (await res.json()) as ZakazkyFilterCountsResponse;
    if (
      typeof json.unclassifiedTotal !== "number" ||
      typeof json.irrelevantForCurrentMode !== "number"
    ) {
      return;
    }
    setFacetCounts(json);
  }, []);

  const refreshListAndFacets = useCallback(
    async (pageNum: number, f: ListFilters) => {
      await fetchData(pageNum, f);
      await fetchFacetCounts(f);
    },
    [fetchData, fetchFacetCounts],
  );

  const filtersSnapshot = useCallback(
    (): ListFilters => ({
      disciplina,
      q,
      zdroj,
      includeUnclassified: showUnclassified,
      includeIrrelevant,
    }),
    [disciplina, q, zdroj, showUnclassified, includeIrrelevant],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void refreshListAndFacets(1, filtersSnapshot());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, refreshListAndFacets, filtersSnapshot]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFeedback({
      type: "info",
      text: "Aktualizace běží. Načítám data ze zdrojů…",
    });
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = (await res.json()) as {
        status?: string;
        message?: string;
        error?: string;
        sourceFailures?: SourceFailureItem[];
        lastIngestFinishedAt?: string | null;
        lastFullSuccessIngestFinishedAt?: string | null;
      };
      if (!res.ok || data.status !== "success") {
        const raw =
          data.error ||
          data.message ||
          res.statusText ||
          "Neznámá chyba při aktualizaci.";
        if (process.env.NODE_ENV === "development") {
          console.error("[Aktualizovat]", raw);
        }
        setRefreshFeedback({
          type: "error",
          text: userFacingIngestError(raw),
        });
        return;
      }
      await refreshListAndFacets(1, filtersSnapshot());
      if (data.lastFullSuccessIngestFinishedAt !== undefined) {
        setLastFullSuccessIngestFinishedAt(
          data.lastFullSuccessIngestFinishedAt,
        );
      }
      const sourceFailures = Array.isArray(data.sourceFailures)
        ? data.sourceFailures.filter(
            (f): f is SourceFailureItem =>
              !!f &&
              typeof f.sourceLabel === "string" &&
              typeof f.reason === "string",
          )
        : [];
      if (sourceFailures.length > 0) {
        setRefreshFeedback({
          type: "warning",
          lines: sourceFailures.map(formatSourceFailureLine),
        });
      } else {
        setRefreshFeedback({
          type: "success",
          text: "Všechny zdroje se správně aktualizovaly.",
        });
      }
    } catch {
      setRefreshFeedback({
        type: "error",
        text: "Chyba spojení při aktualizaci.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="font-sans">
      <div className="mb-2 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <h1 className="text-3xl font-bold text-slate-900">
          Monitoring zakázek
        </h1>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <p
            className="text-sm text-slate-600 sm:max-w-[min(100%,20rem)] sm:text-right"
            title={lastFullSuccessIngestFinishedAt ?? undefined}
          >
            {formatLastFullSuccessLabel(lastFullSuccessIngestFinishedAt)}
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="shrink-0 rounded-md bg-blue-600 px-6 py-2 text-white shadow transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? "Aktualizuji…" : loading ? "Načítám…" : "Aktualizovat"}
          </button>
        </div>
      </div>
      {refreshFeedback && (
        <div
          className={`mb-4 max-w-full rounded-md border px-4 py-3 text-sm leading-snug ${
            refreshFeedback.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : refreshFeedback.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : refreshFeedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {refreshFeedback.type === "warning" ? (
            <ul className="list-disc space-y-2 pl-5">
              {refreshFeedback.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            refreshFeedback.text
          )}
        </div>
      )}
      <p className="mb-6 text-slate-600">
        Přehled veřejných zakázek v oblasti dopravního plánování.
        {total > 0 && (
          <span className="ml-1 font-medium text-slate-800">
            ({total} {total === 1 ? "záznam" : total < 5 ? "záznamy" : "záznamů"})
          </span>
        )}
      </p>

      <div className="mb-4 flex flex-col gap-2 text-sm text-slate-600">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showUnclassified}
            onChange={(e) => {
              const on = e.target.checked;
              setShowUnclassified(on);
              void refreshListAndFacets(1, {
                disciplina,
                q,
                zdroj,
                includeUnclassified: on,
                includeIrrelevant,
              });
            }}
            className="rounded border-slate-300"
          />
          <span>
            Zobrazit i nekategorizované (bez shody disciplíny) —{" "}
            <span className="font-medium text-slate-800 tabular-nums">
              {fmtCount(facetCounts.unclassifiedTotal)}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={includeIrrelevant}
            onChange={(e) => {
              const on = e.target.checked;
              setIncludeIrrelevant(on);
              void refreshListAndFacets(1, {
                disciplina,
                q,
                zdroj,
                includeUnclassified: showUnclassified,
                includeIrrelevant: on,
              });
            }}
            className="rounded border-slate-300"
          />
          <span>
            Zahrnout označené jako irelevantní —{" "}
            <span className="font-medium text-slate-800 tabular-nums">
              {fmtCount(facetCounts.irrelevantForCurrentMode)}
            </span>
          </span>
        </label>
      </div>

      <div className="mb-8 flex flex-col gap-4 md:flex-row">
        <input
          type="search"
          placeholder="Hledat zakázky (název, popis)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="grow rounded-md border border-slate-200 p-2 text-gray-800 shadow-sm outline-none transition focus:ring focus:ring-blue-200"
          autoComplete="off"
        />
        <select
          value={disciplina}
          onChange={(e) => {
            const v = e.target.value;
            setDisciplina(v);
            void refreshListAndFacets(1, {
              disciplina: v,
              q,
              zdroj,
              includeUnclassified: showUnclassified,
              includeIrrelevant,
            });
          }}
          className="rounded-md border border-slate-200 p-2 text-gray-800 shadow-sm outline-none transition focus:ring focus:ring-blue-200 enabled:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 md:min-w-56"
        >
          <option value="">Všechny disciplíny</option>
          <option value="Dopravní modelování">Dopravní modelování</option>
          <option value="Dopravně-inženýrské studie">
            Dopravně-inženýrské studie
          </option>
          <option value="Veřejná doprava">Veřejná doprava</option>
          <option value="Cyklo a pěší doprava">Cyklo a pěší doprava</option>
          <option value="Udržitelná mobilita">Udržitelná mobilita</option>
          <option value="ITS a telematika">ITS a telematika</option>
          <option value="Parkování">Parkování</option>
          <option value="Bezpečnost silničního provozu">
            Bezpečnost silničního provozu
          </option>
        </select>
        <select
          value={zdroj}
          onChange={(e) => {
            const v = e.target.value;
            setZdroj(v);
            void refreshListAndFacets(1, {
              disciplina,
              q,
              zdroj: v,
              includeUnclassified: showUnclassified,
              includeIrrelevant,
            });
          }}
          className="rounded-md border border-slate-200 p-2 text-gray-800 shadow-sm outline-none transition focus:ring focus:ring-blue-200 md:min-w-48"
        >
          <option value="">Všechny zdroje</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="mb-4 text-center text-sm text-slate-500">
          Načítám…
        </div>
      )}

      <div className="space-y-4">
        {zakazky.length === 0 && !loading && (
          <div className="rounded-lg border border-slate-200 bg-gray-50 p-12 text-center text-gray-500">
            <p>Žádné zakázky k zobrazení.</p>
            <p className="mt-2 text-sm">
              Upravte filtry, nebo klikněte na „Aktualizovat“.
            </p>
          </div>
        )}
        {zakazky.map((z) => (
          <article
            key={z.id}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-2 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold leading-tight md:text-xl">
                <Link
                  href={`/zakazky/${z.id}`}
                  className="text-blue-700 transition hover:text-blue-500"
                >
                  {z.nazev}
                </Link>
                <a
                  href={z.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-block align-baseline text-xs font-medium text-slate-500 underline-offset-2 hover:text-blue-600 hover:underline"
                  title="Otevřít u zadavatele"
                >
                  zdroj ↗
                </a>
              </h2>
              <div className="max-w-[13rem] whitespace-normal rounded bg-slate-100 px-2 py-1 text-right text-xs font-medium text-slate-600 md:max-w-none md:whitespace-nowrap md:text-sm">
                {z.datum_publikace ? (
                  <ZakazkaPublishedLine iso={z.datum_publikace} dateStyle="short" />
                ) : (
                  <span className="font-semibold text-red-600">
                    Termín není k dispozici
                  </span>
                )}
                {z.termin_podani_nabidky ? (
                  <span className="mt-1 block text-slate-800">
                    Nabídky do:{" "}
                    {new Date(z.termin_podani_nabidky).toLocaleString("cs-CZ", {
                      day: "numeric",
                      month: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : (
                  z.datum_publikace && (
                    <span className="mt-1 block font-medium text-amber-700">
                      Lhůtu podání se nepodařilo dohledat.
                    </span>
                  )
                )}
              </div>
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Zdroj: {z.zdroj}
              {z.status === "IRRELEVANT" && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-medium normal-case text-amber-900">
                  Irelevantní
                </span>
              )}
            </p>
            <div className="mb-3">
              <ZakazkaDataFreshness
                naposledy_stazeno={z.naposledy_stazeno}
                naposledy_upraveno_zaznamu={z.naposledy_upraveno_zaznamu}
                datum_aktualizace={z.datum_aktualizace}
              />
            </div>
            {z.popis && (
              <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-700">
                {z.popis}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {z.disciplina && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">
                  {z.disciplina}
                </span>
              )}
              {z.klicova_slova.length > 0 && (
                <div className="flex flex-wrap gap-1">
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
            </div>
          </article>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => void fetchData(page - 1, filtersSnapshot())}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Předchozí
          </button>
          <span className="px-3 text-sm text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => void fetchData(page + 1, filtersSnapshot())}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Další →
          </button>
        </nav>
      )}
    </div>
  );
}
