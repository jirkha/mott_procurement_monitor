import type { PrismaClient } from "@prisma/client";
import type { SourceFailure } from "./fetcher";

/** Informační řádky z outbound limiteru — neznamenají neúspěch stahování zdroje. */
const PROXY_PILOT_KANDIDAT_PREFIX = "Proxy pilot kandidat";

export function isBlockingSourceFailure(f: SourceFailure): boolean {
  const label = f.sourceLabel ?? "";
  return !label.startsWith(PROXY_PILOT_KANDIDAT_PREFIX);
}

export function allSourcesFetchedOkFromFailures(
  failures: SourceFailure[] | undefined,
): boolean {
  return !(failures ?? []).some(isBlockingSourceFailure);
}

/**
 * Kompletní úspěch = žádný blokující záznam v sourceFailures (viz isBlockingSourceFailure).
 * Preferuje uložené allSourcesFetchedOk; jinak dopočítá z pole sourceFailures.
 */
export function isFullSourceSuccess(stats: unknown): boolean {
  if (!stats || typeof stats !== "object") return false;
  const s = stats as Record<string, unknown>;
  if (typeof s.allSourcesFetchedOk === "boolean") {
    return s.allSourcesFetchedOk;
  }
  const failures = s.sourceFailures;
  if (!Array.isArray(failures)) return false;
  return !failures.some(
    (item) =>
      item &&
      typeof item === "object" &&
      isBlockingSourceFailure(item as SourceFailure),
  );
}

const RECENT_SUCCESS_RUNS_CAP = 200;

/** Poslední dokončený běh se statusem success, u kterého isFullSourceSuccess(stats). */
export async function getLastFullSuccessIngestFinishedAt(
  prisma: PrismaClient,
): Promise<Date | null> {
  const runs = await prisma.ingestionRun.findMany({
    where: { status: "success", finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    take: RECENT_SUCCESS_RUNS_CAP,
    select: { finishedAt: true, stats: true },
  });
  for (const r of runs) {
    if (r.finishedAt && isFullSourceSuccess(r.stats)) {
      return r.finishedAt;
    }
  }
  return null;
}
