/** Maximální stáří (hodiny) pro stav „Aktuální“. */
export const FRESHNESS_CURRENT_MAX_HOURS = 24;
/** Maximální stáří (hodiny) pro stav „Starší“; nad tuto hranici je „Zastaralé“. */
export const FRESHNESS_OLDER_MAX_HOURS = 72;

export type DataFreshnessKind = "current" | "older" | "stale";

export function classifyDataFreshness(
  lastFetchedAt: Date,
  now: Date = new Date(),
): DataFreshnessKind {
  const hours = (now.getTime() - lastFetchedAt.getTime()) / 3_600_000;
  if (hours < FRESHNESS_CURRENT_MAX_HOURS) return "current";
  if (hours < FRESHNESS_OLDER_MAX_HOURS) return "older";
  return "stale";
}
