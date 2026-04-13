import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  isAuthEnabled,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json(
      { status: "error", error: "Přihlašování není nastaveno (AUTH_SECRET)." },
      { status: 503 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json(
      { status: "error", error: "Neplatný požadavek." },
      { status: 400 },
    );
  }

  const username = body.username?.trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json(
      { status: "error", error: "Vyplňte jméno a heslo." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json(
      { status: "error", error: "Neplatné přihlašovací údaje." },
      { status: 401 },
    );
  }

  const ok = await compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { status: "error", error: "Neplatné přihlašovací údaje." },
      { status: 401 },
    );
  }

  const token = await createSessionToken({
    sub: user.id,
    username: user.username,
    role: user.role,
  });

  const res = NextResponse.json({ status: "success", username: user.username });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
