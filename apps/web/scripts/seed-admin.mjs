/**
 * Vytvoří nebo aktualizuje lokálního admin uživatele (heslo z env).
 *
 * Spuštění z kořene monorepa (DATABASE_URL musí odkazovat na stejnou DB jako Next.js):
 *   MOTT_ADMIN_PASSWORD='váš-heslo' node apps/web/scripts/seed-admin.mjs
 *
 * Volitelně: MOTT_ADMIN_USERNAME (výchozí admin).
 */
import { hashSync } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const username = process.env.MOTT_ADMIN_USERNAME?.trim() || "admin";
const password = process.env.MOTT_ADMIN_PASSWORD;

async function main() {
  if (!password || password.length < 8) {
    console.error("Nastavte MOTT_ADMIN_PASSWORD (min. 8 znaků).");
    process.exit(1);
  }
  const passwordHash = hashSync(password, 12);
  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      role: "ADMIN",
    },
    update: {
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log("Seed OK:", user.username, user.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
