import { ZakazkaStatus, type Prisma } from "@prisma/client";

/** Aktivní stavy kromě IRRELEVANT — explicitní seznam spolehlivější než `not: IRRELEVANT` (SQLite/Prisma). */
export const STATUSES_EXCLUDING_IRRELEVANT: readonly ZakazkaStatus[] = [
  ZakazkaStatus.NEW,
  ZakazkaStatus.IN_PROGRESS,
  ZakazkaStatus.CLOSED,
];

const BLOCKED_PROCEDURE_PHRASES = [
  "přímé zadání",
  "prime zadani",
  "jednací řízení bez uveřejnění",
  "jednaci rizeni bez uverejneni",
] as const;

function blockedProcedureWhere(): Prisma.ZakazkaWhereInput {
  return {
    NOT: {
      OR: BLOCKED_PROCEDURE_PHRASES.flatMap((phrase) => [
        { title: { contains: phrase } },
        { description: { contains: phrase } },
      ]),
    },
  };
}

/** U zakázek bez známé lhůty podání zobrazit jen zveřejnění ne starší než tento interval. */
export const MONTHS_MAX_AGE_WITHOUT_DEADLINE = 3;

function subtractCalendarMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() - months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/**
 * Přehled jen aktivních oken vůči `now`:
 * - známá lhůta v minulosti → skryto;
 * - známé datum zveřejnění v budoucnosti → skryto;
 * - lhůta chybí → jen pokud je zveřejnění ne starší než {@link MONTHS_MAX_AGE_WITHOUT_DEADLINE} měsíců;
 * - bez lhůty i bez zveřejnění → skryto.
 */
export function zakazkaActiveSubmissionWindowWhere(
  now: Date = new Date(),
): Prisma.ZakazkaWhereInput {
  const publishedNotAfterNow = {
    OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
  } satisfies Prisma.ZakazkaWhereInput;

  const threeMonthsAgo = subtractCalendarMonths(now, MONTHS_MAX_AGE_WITHOUT_DEADLINE);

  const openKnownDeadline = {
    AND: [{ deadline: { not: null } }, { deadline: { gte: now } }],
  } satisfies Prisma.ZakazkaWhereInput;

  const noDeadlineButRecentPublication = {
    AND: [
      { deadline: null },
      { publishedAt: { not: null } },
      { publishedAt: { gte: threeMonthsAgo } },
    ],
  } satisfies Prisma.ZakazkaWhereInput;

  return {
    AND: [
      publishedNotAfterNow,
      { OR: [openKnownDeadline, noDeadlineButRecentPublication] },
    ],
  };
}

export type ZakazkaListFilterInput = {
  includeUnclassified: boolean;
  includeIrrelevant: boolean;
  disciplina?: string;
  q?: string;
  zdroj?: string;
};

export function buildZakazkaWhere(
  p: ZakazkaListFilterInput,
  now: Date = new Date(),
): Prisma.ZakazkaWhereInput {
  const parts: Prisma.ZakazkaWhereInput[] = [
    zakazkaActiveSubmissionWindowWhere(now),
    blockedProcedureWhere(),
  ];

  if (!p.includeIrrelevant) {
    parts.push({ status: { in: [...STATUSES_EXCLUDING_IRRELEVANT] } });
  }

  if (!p.includeUnclassified) {
    parts.push({
      disciplina: p.disciplina
        ? { equals: p.disciplina }
        : { not: null },
    });
  } else if (p.disciplina) {
    parts.push({ disciplina: { equals: p.disciplina } });
  }

  if (p.q) {
    parts.push({
      OR: [
        { title: { contains: p.q } },
        { description: { contains: p.q } },
      ],
    });
  }

  if (p.zdroj) {
    parts.push({ sourceId: p.zdroj });
  }

  return { AND: parts };
}

/** Zakázky bez disciplíny (nekategorizované) — stejné fulltext a zdroj jako přehled. */
export function buildUnclassifiedBaseWhere(
  p: Pick<ZakazkaListFilterInput, "q" | "zdroj" | "includeIrrelevant">,
  now: Date = new Date(),
): Prisma.ZakazkaWhereInput {
  const parts: Prisma.ZakazkaWhereInput[] = [
    zakazkaActiveSubmissionWindowWhere(now),
    { disciplina: null },
    blockedProcedureWhere(),
  ];
  if (!p.includeIrrelevant) {
    parts.push({ status: { in: [...STATUSES_EXCLUDING_IRRELEVANT] } });
  }
  if (p.q) {
    parts.push({
      OR: [
        { title: { contains: p.q } },
        { description: { contains: p.q } },
      ],
    });
  }
  if (p.zdroj) {
    parts.push({ sourceId: p.zdroj });
  }
  return { AND: parts };
}

/** Irelevantní záznamy odpovídající aktuálnímu režimu (disciplína / nekategorizované + hledání). */
export function buildIrrelevantOnlyWhere(
  p: ZakazkaListFilterInput,
): Prisma.ZakazkaWhereInput {
  const base = buildZakazkaWhere({ ...p, includeIrrelevant: true });
  return {
    AND: [base, { status: ZakazkaStatus.IRRELEVANT }],
  };
}
