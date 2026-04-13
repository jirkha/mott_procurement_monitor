#!/usr/bin/env node
/**
 * Smaže všechny zakázky pro daný záznam Source (podle přesného pole `name`) a následně Source.
 *
 *   npm run db:remove-source
 *   npm run db:remove-source -- "Profil - X"
 *
 * Výchozí název (retired MFCR profil):
 *   Profil - Ministerstvo financí
 */
import { PrismaClient } from "@prisma/client";
import { ensureDatabaseUrl } from "./load-database-url.mjs";

ensureDatabaseUrl();

const DEFAULT_RETIRED = "Profil - Ministerstvo financí";
const sourceName = (process.argv[2] || DEFAULT_RETIRED).trim();

const prisma = new PrismaClient();

async function main() {
  const src = await prisma.source.findFirst({
    where: { name: sourceName },
    select: { id: true, name: true },
  });

  if (!src) {
    console.log(`Zdroj nenalezen (žádný záznam Source.name = ${JSON.stringify(sourceName)}).`);
    return;
  }

  const delZ = await prisma.zakazka.deleteMany({ where: { sourceId: src.id } });
  await prisma.source.delete({ where: { id: src.id } });

  console.log(
    `OK: smazán zdroj ${JSON.stringify(src.name)} včetně ${delZ.count} zakázek.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
