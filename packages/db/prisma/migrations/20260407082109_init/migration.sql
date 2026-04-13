-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Zakazka" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "externalRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "deadline" DATETIME,
    "contractType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "rawPayload" JSONB,
    "buyerName" TEXT,
    "estimatedValue" TEXT,
    "location" TEXT,
    "assignedUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Zakazka_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Zakazka_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Label_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZakazkaLabel" (
    "zakazkaId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    PRIMARY KEY ("zakazkaId", "labelId"),
    CONSTRAINT "ZakazkaLabel_zakazkaId_fkey" FOREIGN KEY ("zakazkaId") REFERENCES "Zakazka" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZakazkaLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DisciplineKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disciplineId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    CONSTRAINT "DisciplineKeyword_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserZakazkaState" (
    "userId" TEXT NOT NULL,
    "zakazkaId" TEXT NOT NULL,
    "seenAt" DATETIME,

    PRIMARY KEY ("userId", "zakazkaId"),
    CONSTRAINT "UserZakazkaState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserZakazkaState_zakazkaId_fkey" FOREIGN KEY ("zakazkaId") REFERENCES "Zakazka" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" DATETIME,
    "zakazkaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_zakazkaId_fkey" FOREIGN KEY ("zakazkaId") REFERENCES "Zakazka" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "errorLog" TEXT,
    "stats" JSONB
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Zakazka_publishedAt_idx" ON "Zakazka"("publishedAt");

-- CreateIndex
CREATE INDEX "Zakazka_deadline_idx" ON "Zakazka"("deadline");

-- CreateIndex
CREATE INDEX "Zakazka_sourceId_idx" ON "Zakazka"("sourceId");

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
