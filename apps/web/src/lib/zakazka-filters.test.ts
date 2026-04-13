import { describe, expect, it } from "vitest";
import {
  MONTHS_MAX_AGE_WITHOUT_DEADLINE,
  zakazkaActiveSubmissionWindowWhere,
} from "./zakazka-filters";

function subtractCalendarMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() - months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

describe("zakazkaActiveSubmissionWindowWhere", () => {
  it("umožní buď otevřenou známou lhůtu, nebo chybějící lhůtu jen u nedávného zveřejnění", () => {
    const now = new Date("2026-04-09T12:00:00.000Z");
    const w = zakazkaActiveSubmissionWindowWhere(now);
    const threeMonthsAgo = subtractCalendarMonths(
      now,
      MONTHS_MAX_AGE_WITHOUT_DEADLINE,
    );

    expect(w.AND).toHaveLength(2);
    expect(w.AND![0]).toMatchObject({
      OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
    });
    expect(w.AND![1]).toEqual({
      OR: [
        {
          AND: [
            { deadline: { not: null } },
            { deadline: { gte: now } },
          ],
        },
        {
          AND: [
            { deadline: null },
            { publishedAt: { not: null } },
            { publishedAt: { gte: threeMonthsAgo } },
          ],
        },
      ],
    });
  });
});
