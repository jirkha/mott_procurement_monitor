/**
 * Převod technických chyb ingestu / Prisma na krátkou zprávu pro UI (ne celý stack / výpis invokace).
 */
export function userFacingIngestError(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) {
    return "Aktualizace selhala. Zkuste to znovu nebo kontaktujte správce.";
  }

  if (
    /Unknown argument\s+[`']?lastFetchedAt/i.test(s) ||
    /Unknown arg.*lastFetchedAt/i.test(s) ||
    /no such column:\s*lastFetchedAt/i.test(s) ||
    /no such column.*lastFetchedAt/i.test(s)
  ) {
    return (
      "Databáze nebo Prisma klient není sladěný s aktuálním kódem (pole lastFetchedAt). " +
      "Z kořene projektu spusťte npm run db:migrate a npm run db:generate, poté restartujte vývojový server."
    );
  }

  if (
    /Invalid `prisma\./i.test(s) ||
    /PrismaClientValidationError/i.test(s) ||
    /PrismaClientKnownRequestError/i.test(s)
  ) {
    return (
      "Chyba při ukládání do databáze. Ověřte migrace (npm run db:migrate), " +
      "vygenerujte klienta (npm run db:generate) a restartujte aplikaci."
    );
  }

  const firstLine =
    s.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? s;
  const max = 220;
  return firstLine.length <= max ? firstLine : `${firstLine.slice(0, max)}…`;
}
