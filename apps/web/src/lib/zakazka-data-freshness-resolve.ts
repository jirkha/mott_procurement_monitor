import { classifyDataFreshness, type DataFreshnessKind } from "./data-freshness";

export type FreshnessBadgeKind = DataFreshnessKind | "unknown";

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatCsDateTimeShort(d: Date): string {
  return d.toLocaleString("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Čistá logika pro UI čerstvosti: preferuje `lastFetchedAt` (DTO: naposledy_stazeno),
 * jinak `updatedAt` (DTO: naposledy_upraveno_zaznamu). Odlišný řádek pro čas ze zdroje (recordUpdatedAt v DTO jako datum_aktualizace).
 */
export function resolveZakazkaFreshness(input: {
  naposledy_stazeno: string | null;
  naposledy_upraveno_zaznamu: string | null;
  datum_aktualizace: string | null;
  now?: Date;
}): {
  badgeKind: FreshnessBadgeKind;
  primaryTimeLabel: string;
  primarySuffix: string;
  sourceSubline: string | null;
  fromExplicitFetch: boolean;
  /** Pro title/tooltip na hlavním řádku */
  primaryHint: string;
} {
  const fetched = parseIso(input.naposledy_stazeno);
  const dbUpdated = parseIso(input.naposledy_upraveno_zaznamu);
  const sourceUpd = parseIso(input.datum_aktualizace);
  const now = input.now ?? new Date();

  const fromExplicitFetch = !!fetched;
  const referenceAt = fetched ?? dbUpdated;

  let badgeKind: FreshnessBadgeKind;
  let primaryTimeLabel: string;
  let primarySuffix: string;
  let primaryHint: string;

  if (referenceAt) {
    badgeKind = classifyDataFreshness(referenceAt, now);
    primaryTimeLabel = formatCsDateTimeShort(referenceAt);
    if (fromExplicitFetch) {
      primarySuffix = "";
      primaryHint =
        "Čas posledního úspěšného stažení tohoto záznamu do aplikace při synchronizaci.";
    } else {
      primarySuffix = " (poslední změna záznamu v aplikaci)";
      primaryHint =
        "Čas poslední změny záznamu v databázi (synchronizace, přepočet disciplíny, úprava stavu apod.).";
    }
  } else {
    badgeKind = "unknown";
    primaryTimeLabel = "Doporučeno ověřit ve zdroji";
    primarySuffix = "";
    primaryHint = "Chybí čas synchronizace i čas poslední změny záznamu.";
  }

  const sourceSubline = sourceUpd
    ? `Aktualizace ve zdroji: ${formatCsDateTimeShort(sourceUpd)}`
    : null;

  return {
    badgeKind,
    primaryTimeLabel,
    primarySuffix,
    sourceSubline,
    fromExplicitFetch,
    primaryHint,
  };
}
