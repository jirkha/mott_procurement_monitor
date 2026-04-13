import { NextResponse } from "next/server";
import type { SessionClaims } from "./session";
import { getSessionUser, isAuthEnabled } from "./session";

export async function requireApiUser(): Promise<
  NextResponse | { user: SessionClaims } | { authDisabled: true }
> {
  if (!isAuthEnabled()) {
    return { authDisabled: true };
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { status: "error", error: "Vyžadováno přihlášení." },
      { status: 401 },
    );
  }
  return { user };
}

export async function requireApiAdmin(): Promise<
  NextResponse | { user: SessionClaims } | { authDisabled: true }
> {
  const gate = await requireApiUser();
  if (gate instanceof NextResponse) return gate;
  if ("authDisabled" in gate) return gate;
  if (gate.user.role !== "ADMIN") {
    return NextResponse.json(
      { status: "error", error: "Vyžadována role administrátora." },
      { status: 403 },
    );
  }
  return { user: gate.user };
}

export function reclassifyTokenAuthorized(request: Request): boolean {
  const expected = process.env.RECLASSIFY_TOKEN?.trim();
  if (!expected) return false;
  const provided = request.headers.get("x-reclassify-token");
  return provided === expected;
}
