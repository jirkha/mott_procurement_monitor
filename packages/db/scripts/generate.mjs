#!/usr/bin/env node
/**
 * Vybere schéma pro prisma generate: Postgres na Vercelu / při PRISMA_SCHEMA_TARGET=postgres /
 * když DATABASE_URL (nebo packages/db/.env) je postgres://. Jinak SQLite (lokální vývoj).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dbRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readDatabaseUrlFromDotEnv() {
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

function usePostgresSchema() {
  const forced = process.env.PRISMA_SCHEMA_TARGET?.trim().toLowerCase();
  if (forced === "postgres" || forced === "postgresql") return true;
  if (forced === "sqlite") return false;
  if (process.env.VERCEL === "1") return true;
  const url = (process.env.DATABASE_URL || readDatabaseUrlFromDotEnv()).trim();
  if (!url) return false;
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

const usePg = usePostgresSchema();
const schema = usePg
  ? join(dbRoot, "prisma", "schema.postgres.prisma")
  : join(dbRoot, "prisma", "sqlite", "schema.prisma");

const env = { ...process.env };
if (!usePg) {
  const u = env.DATABASE_URL?.trim() ?? "";
  if (!u.startsWith("file:")) {
    env.DATABASE_URL = "file:./dev.db";
  }
}

execSync(`npx prisma generate --schema="${schema}"`, {
  stdio: "inherit",
  cwd: dbRoot,
  env,
});
