import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LOCAL_SQLITE_RELATIVE = "file:./dev.db";

function parseFirstDatabaseUrl(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = /^DATABASE_URL\s*=\s*(.*)$/.exec(s);
    if (!m) continue;
    return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function repoRootFromHere(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..");
}

/** Lokální Next dev / preview — ne produkční nasazení na Vercelu. */
function useLocalSqlitePreference(): boolean {
  return process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production";
}

export function isSqliteDatabaseUrl(url: string | undefined): boolean {
  const u = url?.trim();
  return !!u && u.startsWith("file:");
}

/**
 * Nastaví DATABASE_URL pro Prisma. Při lokálním vývoji preferuje SQLite (`file:`), aby starý
 * `postgresql://localhost` v apps/web/.env.local nepřebíjel packages/db/.env.
 */
export function ensureDatabaseUrl(): void {
  const repoRoot = repoRootFromHere();
  const dbEnvPath = join(repoRoot, "packages", "db", ".env");
  const webLocalPath = join(repoRoot, "apps", "web", ".env.local");

  if (!useLocalSqlitePreference()) {
    if (!process.env.DATABASE_URL?.trim()) {
      const fallback =
        parseFirstDatabaseUrl(dbEnvPath) ?? parseFirstDatabaseUrl(webLocalPath);
      if (fallback) process.env.DATABASE_URL = fallback;
    }
    return;
  }

  const fromDb = parseFirstDatabaseUrl(dbEnvPath);
  const fromWeb = parseFirstDatabaseUrl(webLocalPath);

  if (fromDb && isSqliteDatabaseUrl(fromDb)) {
    process.env.DATABASE_URL = fromDb;
    return;
  }
  if (fromWeb && isSqliteDatabaseUrl(fromWeb)) {
    process.env.DATABASE_URL = fromWeb;
    return;
  }
  if (isSqliteDatabaseUrl(process.env.DATABASE_URL)) return;

  process.env.DATABASE_URL = DEFAULT_LOCAL_SQLITE_RELATIVE;
}
