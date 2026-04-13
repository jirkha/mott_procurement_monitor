/*
  Warnings:

  - Added the required column `slug` to the `Source` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Zakazka" ADD COLUMN "disciplina" TEXT;
ALTER TABLE "Zakazka" ADD COLUMN "keywords" JSONB;
ALTER TABLE "Zakazka" ADD COLUMN "recordUpdatedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Source" ("baseUrl", "config", "createdAt", "id", "isEnabled", "kind", "name", "updatedAt") SELECT "baseUrl", "config", "createdAt", "id", "isEnabled", "kind", "name", "updatedAt" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
