#!/usr/bin/env node
/**
 * prisma migrate dev pro SQLite — pokud v packages/db/.env zůstal postgresql:// (např. kopie pro
 * Supabase), Prisma u provider=sqlite selže (P1012). Pro lokální migrace vynutíme file: URL.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dbRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(dbRoot, ".env");

function readDatabaseUrlFromDotEnv() {
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

const fromEnvFile = readDatabaseUrlFromDotEnv();
const fromProcess = process.env.DATABASE_URL?.trim() ?? "";
const effective = fromProcess || fromEnvFile;

const env = { ...process.env };
if (!effective.startsWith("file:")) {
  env.DATABASE_URL = "file:./dev.db";
  if (effective) {
    console.log(
      "[@mott/db] Lokální migrate používá SQLite. DATABASE_URL není file: — nastavuji file:./dev.db (viz packages/db/.env.example).",
    );
  }
}

execSync(
  "npx prisma migrate dev --schema=./prisma/sqlite/schema.prisma",
  {
    stdio: "inherit",
    cwd: dbRoot,
    env,
  },
);
