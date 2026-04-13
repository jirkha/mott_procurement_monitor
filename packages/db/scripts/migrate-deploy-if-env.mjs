#!/usr/bin/env node
/**
 * Spustí `prisma migrate deploy`, jen pokud vypadá DATABASE_URL jako Postgres.
 * Hodnotu bere z process.env nebo z packages/db/.env (stejně jako Prisma CLI).
 * SKIP_PRISMA_MIGRATE=1 — přeskočit úplně.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dbRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readDatabaseUrl() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const envPath = join(dbRoot, ".env");
  if (!existsSync(envPath)) return "";
  try {
    const raw = readFileSync(envPath, "utf8");
    const m = /^DATABASE_URL\s*=\s*(.*)$/m.exec(raw);
    if (!m) return "";
    return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

function isPostgresUrl(url) {
  return (
    url.startsWith("postgresql://") || url.startsWith("postgres://")
  );
}

if (
  process.env.SKIP_PRISMA_MIGRATE === "1" ||
  process.env.SKIP_PRISMA_MIGRATE === "true"
) {
  console.log(
    "[@mott/db] SKIP_PRISMA_MIGRATE — přeskakuji prisma migrate deploy.",
  );
  process.exit(0);
}

const databaseUrl = readDatabaseUrl();
if (!isPostgresUrl(databaseUrl)) {
  console.log(
    "[@mott/db] DATABASE_URL není postgres:// — přeskakuji migrate deploy (na Vercelu nastavte Postgres URL).",
  );
  process.exit(0);
}

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  cwd: dbRoot,
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
