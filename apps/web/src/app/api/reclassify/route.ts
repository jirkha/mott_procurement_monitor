import { NextResponse } from "next/server";
import {
  reclassifyTokenAuthorized,
  requireApiAdmin,
} from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { reclassifyAllStoredZakazky } from "@/lib/reclassify-stored";

/**
 * Re-klasifikace uložených záznamů po změně pravidel.
 * - Vývoj: bez `RECLASSIFY_TOKEN` je otevřené; s tokenem vyžadovat hlavičku.
 * - Produkce: pouze ADMIN session nebo platný `x-reclassify-token`.
 */
export async function POST(request: Request) {
  const tokenOk = reclassifyTokenAuthorized(request);

  if (process.env.NODE_ENV === "production") {
    if (!tokenOk) {
      const admin = await requireApiAdmin();
      if (admin instanceof NextResponse) return admin;
    }
  } else if (process.env.RECLASSIFY_TOKEN?.trim() && !tokenOk) {
    return NextResponse.json(
      {
        status: "error",
        error:
          "Missing or invalid x-reclassify-token header for reclassification.",
      },
      { status: 403 },
    );
  }

  const { total, updated, setToNull } =
    await reclassifyAllStoredZakazky(prisma);

  return NextResponse.json({
    status: "success",
    total,
    updated,
    setToNull,
  });
}
