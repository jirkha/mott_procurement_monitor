-- CreateIndex
CREATE INDEX "Zakazka_disciplina_idx" ON "Zakazka"("disciplina");

-- CreateIndex
CREATE INDEX "Zakazka_disciplina_publishedAt_idx" ON "Zakazka"("disciplina", "publishedAt");
