/* Next.js 16: chráněné traty přes `proxy` jen v tomto souboru — souběžný `src/middleware.ts` způsobí pád dev serveru. */
import * as jose from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

function authEnabled(): boolean {
  return (
    Boolean(process.env.AUTH_SECRET?.trim()) &&
    process.env.AUTH_DISABLED !== "1"
  );
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/login")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (/\.(ico|png|svg|webp|txt|json)$/i.test(pathname)) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const u = new URL("/login", request.url);
    u.searchParams.set("from", pathname);
    return NextResponse.redirect(u);
  }

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!.trim());
    await jose.jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const u = new URL("/login", request.url);
    u.searchParams.set("from", pathname);
    return NextResponse.redirect(u);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
