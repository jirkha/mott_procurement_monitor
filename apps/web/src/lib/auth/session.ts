import { cookies } from "next/headers";
import * as jose from "jose";
import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE = "mott_session";

export function isAuthEnabled(): boolean {
  return (
    Boolean(process.env.AUTH_SECRET?.trim()) &&
    process.env.AUTH_DISABLED !== "1"
  );
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionClaims = {
  sub: string;
  username: string;
  role: UserRole;
};

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new jose.SignJWT({
    username: claims.username,
    role: claims.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims> {
  const { payload } = await jose.jwtVerify(token, secretKey());
  const sub = payload.sub;
  const username = payload.username;
  const role = payload.role;
  if (
    typeof sub !== "string" ||
    typeof username !== "string" ||
    (role !== "ADMIN" && role !== "USER")
  ) {
    throw new Error("Invalid session payload");
  }
  return { sub, username, role };
}

export async function getSessionUser(): Promise<SessionClaims | null> {
  if (!isAuthEnabled()) return null;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}
