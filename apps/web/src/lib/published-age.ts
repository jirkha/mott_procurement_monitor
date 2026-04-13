/** Kalendářní počet dní od data zveřejnění do „dnes“ (místní půlnoci). */
export function calendarDaysSincePublication(
  publishedAt: Date,
  now: Date = new Date(),
): number {
  const pubDay = new Date(
    publishedAt.getFullYear(),
    publishedAt.getMonth(),
    publishedAt.getDate(),
  );
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((nowDay.getTime() - pubDay.getTime()) / 86_400_000);
}

/**
 * Krátká relativní fráze (např. „před 2 dny“); 0 → „dnes“, 1 → „včera“.
 */
export function publicationAgePhraseCs(days: number): string {
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  return new Intl.RelativeTimeFormat("cs-CZ", { numeric: "always" }).format(
    -days,
    "day",
  );
}

/** Barva doplňku „| …“ podle stáří (&lt; 30 dní zelená, jinak jantarová). */
export function publicationAgeAccentClass(days: number): string {
  return days < 30 ? "text-emerald-700" : "text-amber-600";
}
