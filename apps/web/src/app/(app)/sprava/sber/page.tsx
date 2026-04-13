import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

/** Odpovídá `IngestionRun` ve schématu — lokální typ (nezávisí na exportu modelu z `@prisma/client` na CI). */
type IngestionRunListItem = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  errorLog: string | null;
  stats: unknown;
};

export const metadata: Metadata = {
  title: "Historie sběru — MOTT",
  description: "Poslední běhy ručního sběru zakázek",
};

export const dynamic = "force-dynamic";

type RunStats = {
  analytics?: {
    nkodMmrAggregates?: {
      sourceLabel?: string;
      rowCount?: number;
      latestYear?: number | null;
      xmlUrl?: string;
      metadataUrl?: string;
    }[];
    pilotAggregators?: {
      sourceId?: string;
      sourceLabel?: string;
      downloadedCount?: number;
      extractedCount?: number;
      classifiedRatio?: number;
      uniqueVsExistingCount?: number;
      duplicateVsExistingCount?: number;
      dedupeByUrlCount?: number;
      dedupeByFallbackCount?: number;
      goDecision?: "go" | "no-go";
      reason?: string;
      stability?: {
        errorCode?: string;
        requestFailed?: boolean;
        timeoutCount?: number;
        httpStatus?: number | null;
        accessDenied?: boolean;
        antiBotDetected?: boolean;
      };
    }[];
    pilotDecisionTrend?: {
      sourceId?: string;
      recentRuns?: number;
      goCount?: number;
      noGoCount?: number;
      latestDecision?: "go" | "no-go";
    }[];
  };
};

function aggregateHealth(metric: {
  rowCount?: number;
  latestYear?: number | null;
}): "ok" | "warning" {
  const currentYear = new Date().getFullYear();
  if ((metric.rowCount ?? 0) <= 0) return "warning";
  if (
    metric.latestYear != null &&
    Number.isFinite(metric.latestYear) &&
    metric.latestYear < currentYear - 1
  ) {
    return "warning";
  }
  return "ok";
}

function formatStats(raw: unknown): string {
  if (raw == null) return "—";
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

function getNkodMmrAggregates(raw: unknown): NonNullable<
  NonNullable<RunStats["analytics"]>["nkodMmrAggregates"]
> {
  if (!raw || typeof raw !== "object") return [];
  const stats = raw as RunStats;
  return Array.isArray(stats.analytics?.nkodMmrAggregates)
    ? stats.analytics.nkodMmrAggregates
    : [];
}

function getPilotAggregators(raw: unknown): NonNullable<
  NonNullable<RunStats["analytics"]>["pilotAggregators"]
> {
  if (!raw || typeof raw !== "object") return [];
  const stats = raw as RunStats;
  return Array.isArray(stats.analytics?.pilotAggregators)
    ? stats.analytics.pilotAggregators
    : [];
}

function getPilotTrend(raw: unknown): NonNullable<
  NonNullable<RunStats["analytics"]>["pilotDecisionTrend"]
> {
  if (!raw || typeof raw !== "object") return [];
  const stats = raw as RunStats;
  return Array.isArray(stats.analytics?.pilotDecisionTrend)
    ? stats.analytics.pilotDecisionTrend
    : [];
}

export default async function SpravaSberPage() {
  const runs = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 40,
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        <Link href="/sprava" className="text-blue-700 hover:text-blue-600">
          ← Správa
        </Link>
      </p>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Historie sběru</h1>
        <p className="mt-2 text-slate-600">
          Naposledy dokončené běhy po kliknutí na <strong>Aktualizovat</strong>.
          Po každém běhu se u všech uložených zakázek přepočítá klasifikace.
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          Zatím žádný záznam. Spusťte sběr z přehledu zakázek.
        </p>
      ) : (
        <ul className="space-y-3">
          {runs.map((r: IngestionRunListItem) => (
            <li
              key={r.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-slate-900">
                  {r.status === "success" ? (
                    <span className="text-green-700">Úspěch</span>
                  ) : r.status === "error" ? (
                    <span className="text-red-700">Chyba</span>
                  ) : (
                    <span className="text-amber-700">{r.status}</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(r.startedAt).toLocaleString("cs-CZ")}
                  {r.finishedAt
                    ? ` → ${new Date(r.finishedAt).toLocaleString("cs-CZ")}`
                    : ""}
                </p>
              </div>
              {r.errorLog ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs text-red-900">
                  {r.errorLog}
                </pre>
              ) : null}
              {(() => {
                const aggregates = getNkodMmrAggregates(r.stats);
                if (!aggregates.length) return null;
                return (
                  <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                    <p className="font-semibold">NKOD/MMR agregace</p>
                    <ul className="mt-1 space-y-1">
                      {aggregates.map((a, idx) => (
                        <li
                          key={`${a.sourceLabel ?? "source"}-${idx}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              aggregateHealth(a) === "ok"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {aggregateHealth(a) === "ok" ? "OK" : "Warning"}
                          </span>
                          <span>
                            {(a.sourceLabel ?? "Neznámý zdroj") +
                              `: ${a.rowCount ?? 0} řádků` +
                              (a.latestYear
                                ? `, poslední rok ${a.latestYear}`
                                : "")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {(() => {
                const pilots = getPilotAggregators(r.stats);
                if (!pilots.length) return null;
                return (
                  <div className="mt-2 rounded border border-violet-200 bg-violet-50 p-2 text-xs text-violet-950">
                    <p className="font-semibold">Pilot komerčních agregátorů</p>
                    <ul className="mt-1 space-y-1">
                      {pilots.map((p, idx) => (
                        <li
                          key={`${p.sourceId ?? "pilot"}-${idx}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              p.goDecision === "go"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {(p.goDecision ?? "no-go").toUpperCase()}
                          </span>
                          <span>
                            {(p.sourceLabel ?? "Neznámý zdroj") +
                              `: extract ${p.extractedCount ?? 0}, klasif. ${(((p.classifiedRatio ?? 0) * 100).toFixed(1))} %, staženo ${p.downloadedCount ?? 0}, unikátní ${p.uniqueVsExistingCount ?? 0}, duplicitní ${p.duplicateVsExistingCount ?? 0} (URL ${p.dedupeByUrlCount ?? 0}, fallback ${p.dedupeByFallbackCount ?? 0})`}
                          </span>
                          {p.reason ? (
                            <span className="text-violet-700">({p.reason})</span>
                          ) : null}
                          {p.stability?.errorCode ? (
                            <span className="text-violet-700">
                              [diag: {p.stability.errorCode}]
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {(() => {
                const trends = getPilotTrend(r.stats);
                if (!trends.length) return null;
                return (
                  <div className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-800">
                    <p className="font-semibold">Trend rozhodnutí (poslední běhy)</p>
                    <ul className="mt-1 space-y-1">
                      {trends.map((t, idx) => (
                        <li key={`${t.sourceId ?? "trend"}-${idx}`}>
                          {(t.sourceId ?? "source") +
                            `: GO ${t.goCount ?? 0}, NO-GO ${t.noGoCount ?? 0}, běhů ${t.recentRuns ?? 0}, poslední ${String(t.latestDecision ?? "no-go").toUpperCase()}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {r.stats != null ? (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">
                  {formatStats(r.stats)}
                </pre>
              ) : null}
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                id: {r.id}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
