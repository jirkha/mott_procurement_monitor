import { resolveZakazkaFreshness } from "@/lib/zakazka-data-freshness-resolve";

type Props = {
  naposledy_stazeno: string | null;
  naposledy_upraveno_zaznamu: string | null;
  datum_aktualizace: string | null;
};

const badgeBase =
  "inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide";

function badgeClassFor(kind: string): string {
  switch (kind) {
    case "current":
      return `${badgeBase} bg-emerald-100 text-emerald-900`;
    case "older":
      return `${badgeBase} bg-amber-100 text-amber-900`;
    case "stale":
      return `${badgeBase} bg-red-100 text-red-900`;
    default:
      return `${badgeBase} bg-slate-200 text-slate-800`;
  }
}

function badgeLabelFor(kind: string): string {
  switch (kind) {
    case "current":
      return "Aktuální";
    case "older":
      return "Starší";
    case "stale":
      return "Zastaralé";
    default:
      return "Neznámé";
  }
}

export default function ZakazkaDataFreshness({
  naposledy_stazeno,
  naposledy_upraveno_zaznamu,
  datum_aktualizace,
}: Props) {
  const view = resolveZakazkaFreshness({
    naposledy_stazeno,
    naposledy_upraveno_zaznamu,
    datum_aktualizace,
  });

  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
      role="status"
      aria-label="Čerstvost dat v aplikaci"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={badgeClassFor(view.badgeKind)}>
          {badgeLabelFor(view.badgeKind)}
        </span>
        <span
          className="font-medium text-slate-800 tabular-nums"
          title={view.primaryHint}
        >
          {view.primaryTimeLabel}
          {view.primarySuffix}
        </span>
      </div>
      {view.sourceSubline ? (
        <p className="mt-1.5 text-xs leading-snug text-slate-600">
          {view.sourceSubline}
        </p>
      ) : null}
    </div>
  );
}
