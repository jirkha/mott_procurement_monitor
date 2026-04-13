import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { buildZakazkaWhere } from "@/lib/zakazka-filters";
import { prisma } from "@/lib/prisma";
import { toZakazkaListRow } from "@/lib/zakazky-map";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const userGate = await requireApiUser();
  if (userGate instanceof NextResponse) return userGate;

  const params = new URL(request.url).searchParams;

  const includeUnclassified = params.get("includeUnclassified") === "1";
  const includeIrrelevant = params.get("includeIrrelevant") === "1";
  const disciplina = params.get("disciplina") || undefined;
  const q = params.get("q")?.trim() || undefined;
  const zdroj = params.get("zdroj") || undefined;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  const where = buildZakazkaWhere({
    includeUnclassified,
    includeIrrelevant,
    disciplina,
    q,
    zdroj,
  });

  const [total, zakazky] = await Promise.all([
    prisma.zakazka.count({ where }),
    prisma.zakazka.findMany({
      where,
      include: { source: true },
      orderBy: { publishedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    data: zakazky.map(toZakazkaListRow),
    total,
    page,
    limit,
    totalPages,
  });
}
