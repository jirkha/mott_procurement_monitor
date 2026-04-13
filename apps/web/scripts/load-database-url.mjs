/**
 * Doplní process.env.DATABASE_URL z packages/db/.env nebo apps/web/.env.local,
 * pokud ještě není nastavené (stejné chování jako u ručního spouštění seed skriptů).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(__dirname, "..", "..", "..");

export function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return;

  const candidates = [
    join(repoRoot, "packages", "db", ".env"),
    join(repoRoot, "apps", "web", ".env.local"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const m = /^DATABASE_URL\s*=\s*(.*)$/.exec(s);
      if (!m) continue;
      process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
      return;
    }
  }
}
