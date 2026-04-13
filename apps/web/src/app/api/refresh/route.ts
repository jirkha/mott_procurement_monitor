import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-auth";
import { getLastFullSuccessIngestFinishedAt } from "@/lib/ingestion/full-success";
import { runIngestion } from "@/lib/ingestion/ingest-to-db";
import { prisma } from "@/lib/prisma";
import { userFacingIngestError } from "@/lib/user-facing-ingest-error";

/** Ruční sběr NEN + vybrané E-ZAK profily a zápis do DB (specifikace §6.1). */
export async function POST() {
  const adminGate = await requireApiAdmin();
  if (adminGate instanceof NextResponse) return adminGate;

  const requestStartedAt = Date.now();
  const result = await runIngestion(prisma);

  revalidatePath("/");

  if (!result.ok) {
    if (process.env.NODE_ENV === "development") {
      console.error("[api/refresh] ingest error:", result.error);
    }
    return NextResponse.json(
      {
        status: "error",
        error: userFacingIngestError(result.error),
        runId: result.runId,
      },
      { status: 500 },
    );
  }

  const countStartedAt = Date.now();
  const totalItems = await prisma.zakazka.count();
  const countDurationMs = Date.now() - countStartedAt;
  const requestDurationMs = Date.now() - requestStartedAt;

  const [runRecord, lastFullSuccessAt] = await Promise.all([
    prisma.ingestionRun.findUnique({
      where: { id: result.runId },
      select: { finishedAt: true },
    }),
    getLastFullSuccessIngestFinishedAt(prisma),
  ]);

  return NextResponse.json({
    status: "success",
    totalItems,
    itemsFetched: result.itemsFetched,
    upserted: result.upserted,
    runId: result.runId,
    lastIngestFinishedAt: runRecord?.finishedAt?.toISOString() ?? null,
    lastFullSuccessIngestFinishedAt: lastFullSuccessAt?.toISOString() ?? null,
    timingsMs: {
      ...result.stats.timingsMs,
      count: countDurationMs,
      request: requestDurationMs,
    },
    sourceTimingsMs: result.stats.sourceTimingsMs,
    sourceFailures: result.stats.sourceFailures,
    analytics: result.stats.analytics,
    message: `Staženo ${result.itemsFetched} záznamů, uloženo/aktualizováno ${result.upserted}. Celkem v DB: ${totalItems}.`,
  });
}
