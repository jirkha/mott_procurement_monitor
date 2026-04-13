-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ZakazkaStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED', 'IRRELEVANT');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('API', 'RSS', 'SCRAPING', 'HYBRID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "baseUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zakazka" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "contractType" TEXT,
    "status" "ZakazkaStatus" NOT NULL DEFAULT 'NEW',
    "rawPayload" JSONB,
    "buyerName" TEXT,
    "estimatedValue" TEXT,
    "location" TEXT,
    "disciplina" TEXT,
    "keywords" JSONB,
    "recordUpdatedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zakazka_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZakazkaLabel" (
    "zakazkaId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "ZakazkaLabel_pkey" PRIMARY KEY ("zakazkaId","labelId")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineKeyword" (
    "id" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "term" TEXT NOT NULL,

    CONSTRAINT "DisciplineKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserZakazkaState" (
    "userId" TEXT NOT NULL,
    "zakazkaId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "UserZakazkaState_pkey" PRIMARY KEY ("userId","zakazkaId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "zakazkaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "errorLog" TEXT,
    "stats" JSONB,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE INDEX "Zakazka_publishedAt_idx" ON "Zakazka"("publishedAt");

-- CreateIndex
CREATE INDEX "Zakazka_deadline_idx" ON "Zakazka"("deadline");

-- CreateIndex
CREATE INDEX "Zakazka_sourceId_idx" ON "Zakazka"("sourceId");

-- CreateIndex
CREATE INDEX "Zakazka_disciplina_idx" ON "Zakazka"("disciplina");

-- CreateIndex
CREATE INDEX "Zakazka_disciplina_publishedAt_idx" ON "Zakazka"("disciplina", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Zakazka_sourceId_externalRef_key" ON "Zakazka"("sourceId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Label_name_key" ON "Label"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_name_key" ON "Discipline"("name");

-- CreateIndex
CREATE INDEX "DisciplineKeyword_term_idx" ON "DisciplineKeyword"("term");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineKeyword_disciplineId_term_key" ON "DisciplineKeyword"("disciplineId", "term");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Zakazka" ADD CONSTRAINT "Zakazka_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zakazka" ADD CONSTRAINT "Zakazka_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZakazkaLabel" ADD CONSTRAINT "ZakazkaLabel_zakazkaId_fkey" FOREIGN KEY ("zakazkaId") REFERENCES "Zakazka"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZakazkaLabel" ADD CONSTRAINT "ZakazkaLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineKeyword" ADD CONSTRAINT "DisciplineKeyword_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserZakazkaState" ADD CONSTRAINT "UserZakazkaState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserZakazkaState" ADD CONSTRAINT "UserZakazkaState_zakazkaId_fkey" FOREIGN KEY ("zakazkaId") REFERENCES "Zakazka"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_zakazkaId_fkey" FOREIGN KEY ("zakazkaId") REFERENCES "Zakazka"("id") ON DELETE SET NULL ON UPDATE CASCADE;
