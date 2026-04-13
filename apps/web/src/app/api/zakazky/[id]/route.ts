import { NextResponse } from "next/server";
import { ZakazkaStatus } from "@prisma/client";
import { requireApiUser } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUS = new Set<ZakazkaStatus>([
  ZakazkaStatus.NEW,
  ZakazkaStatus.IRRELEVANT,
]);

/** Označení zakázky jako irelevantní / vrácení do NEW (specifikace §2.1). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userGate = await requireApiUser();
  if (userGate instanceof NextResponse) return userGate;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Neplatné tělo požadavku." },
      { status: 400 },
    );
  }

  const statusRaw =
    body &&
    typeof body === "object" &&
    "status" in body &&
    typeof (body as { status: unknown }).status === "string"
      ? (body as { status: string }).status
      : null;

  if (!statusRaw || !ALLOWED_STATUS.has(statusRaw as ZakazkaStatus)) {
    return NextResponse.json(
      {
        status: "error",
        error: "Povolené hodnoty status: NEW, IRRELEVANT.",
      },
      { status: 400 },
    );
  }

  const status = statusRaw as ZakazkaStatus;

  const exists = await prisma.zakazka.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json(
      { status: "error", error: "Zakázka nenalezena." },
      { status: 404 },
    );
  }

  await prisma.zakazka.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ status: "ok", zakazkaStatus: status });
}
