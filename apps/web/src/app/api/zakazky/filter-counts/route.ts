import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import {
  buildIrrelevantOnlyWhere,
  buildUnclassifiedBaseWhere,
} from "@/lib/zakazka-filters";
import { prisma } from "@/lib/prisma";
import type { ZakazkyFilterCountsResponse } from "@/types/zakazky";

/** Počty pro popisky zaškrtávacích filtrů (stejné fulltext/zdroj jako přehled). */
export async function GET(request: Request) {
  const userGate = await requireApiUser();
  if (userGate instanceof NextResponse) return userGate;

  const params = new URL(request.url).searchParams;
  const includeUnclassified = params.get("includeUnclassified") === "1";
  const includeIrrelevant = params.get("includeIrrelevant") === "1";
  const disciplina = params.get("disciplina") || undefined;
  const q = params.get("q")?.trim() || undefined;
  const zdroj = params.get("zdroj") || undefined;

  const listCtx = {
    includeUnclassified,
    includeIrrelevant,
    disciplina,
    q,
    zdroj,
  };

  const [unclassifiedTotal, irrelevantForCurrentMode] = await Promise.all([
    prisma.zakazka.count({
      where: buildUnclassifiedBaseWhere({
        q,
        zdroj,
        includeIrrelevant,
      }),
    }),
    prisma.zakazka.count({
      where: buildIrrelevantOnlyWhere(listCtx),
    }),
  ]);

  const body: ZakazkyFilterCountsResponse = {
    unclassifiedTotal,
    irrelevantForCurrentMode,
  };

  return NextResponse.json(body);
}
