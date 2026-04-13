# Workflow: aktuální data ve UI po změnách v ingestu

Po úpravách v tomto workflow nebo jinde v repu zkontroluj, zda tento soubor (a případně další `.cursor/*.md`) stále odpovídá kódu — obecné pravidlo: **§3.3.1** v `.cursor/specifikace_monitoringu_zakazek_CZ.md`.

**Seznam zakázek čte z databáze.** Úpravy v `apps/web/src/lib/ingestion/` (parsování datumů, URL, E‑ZAK, PROEBIZ, …) se v prohlížeči projeví až po **novém zápisu do DB**.

## Postup (lokálně i po nasazení)

1. **Zajistit `DATABASE_URL`** (stejná DB jako běžící Next.js) — např. `packages/db/.env` nebo `apps/web/.env.local`.
2. **Spustit plný sběr** (ekvivalent administrátorského `POST /api/refresh`):
   ```bash
   npm run ingest
   ```
   Spouští `apps/web/scripts/run-ingest.ts` přes `tsx` (workspaces: z kořene monorepa).
3. **Volitelně: audit DB po sběru** — souhrn lhůt, duplicit `sourceUrl`, EVEZA URL a blokovaných frází:
   ```bash
   npm run ingest:post-audit
   ```
4. **Obnovit UI** v prohlížeči (F5 nebo navigace na přehled zakázek). Pokud běží dev server s cache, případně restart `npm run dev`.

## Alternativa přes běžící aplikaci

- Přihlásit se jako admin a použít v UI akci **Aktualizovat** (volá `/api/refresh`), pak případně `npm run ingest:post-audit` z kořene repa.
- Pokud se část zdrojů neaktualizuje (429/timeout apod.), UI zobrazí nahoře **žluté upozornění** se seznamem zdrojů; pro tyto zdroje se dál zobrazují poslední uložená data.

## Pro asistenty (Cursor Agent)

Po merge nebo úpravě souborů v `apps/web/src/lib/ingestion/` **automaticky spusť** z kořene repozitáře `npm run ingest` (po úspěšném `npm install`, pokud chybí závislosti), aby uživatel ihned viděl opravené údaje v seznamu zakázek. Pokud ingest selže (síť, DB), popiš chybu a nenechávej předpoklad, že UI je aktuální.

## Env související s ingestem

- E‑ZAK detail: výchozí přepis ze stránky detailu pro všechny položky — viz `INGEST_EZAK_DETAIL_ENRICH` v `apps/web/.env.example`.
- Vypnutí dotahování detailu E‑ZAK: `INGEST_EZAK_DETAIL_DEADLINE=0`.
- Platformové vyřazení nežádoucích postupů (`přímé zadání`, `jednací řízení bez uveřejnění`) u NEN/TenderArena je výchozí; vypnutí pouze pro diagnostiku: `INGEST_EXCLUDE_BLOCKED_PROCEDURE_TYPES=0`.
- Fázované spouštění zdrojů (nižší špičky paralelity): `INGEST_PHASED_FETCH` (`1` = zapnuto).
- Lookback XML sběru profilů (měsíce): `INGEST_LOOKBACK_MONTHS` (výchozí `12`).
- NEN XML timeout/retry: `INGEST_NEN_FETCH_TIMEOUT_MS`, `INGEST_NEN_ABORT_RETRY`, `INGEST_NEN_ABORT_RETRY_MAX`, `INGEST_NEN_ABORT_RETRY_BACKOFF_MS`, `INGEST_NEN_ABORT_TIMEOUT_STEP_MS`, `INGEST_NEN_ABORT_TIMEOUT_MAX_MS`, `INGEST_NEN_CONCURRENCY`.
- Retry při `HTTP 429` u XML profilů: `INGEST_XML_RETRY_429_MAX`, `INGEST_XML_RETRY_429_BACKOFF_MS`, `INGEST_XML_RETRY_429_JITTER_MS`, `INGEST_XML_RETRY_429_MAX_WAIT_MS`.
- Concurrency generických XML profilů (mimo NEN): `INGEST_XML_PROFILE_CONCURRENCY` (výchozí `2`).
- Globální + host-aware outbound limiter: `INGEST_OUTBOUND_CONCURRENCY`, `INGEST_OUTBOUND_PER_HOST_CONCURRENCY`, `INGEST_OUTBOUND_RISKY_HOST_CONCURRENCY`, `INGEST_HOST_MIN_INTERVAL_MS`, `INGEST_429_COOLDOWN_MS`, `INGEST_429_COOLDOWN_JITTER_MS`.
- Proxy pilot (fallback track pro hosty s vysokým podílem 429): `INGEST_PROXY_PILOT_ENABLED`, `INGEST_PROXY_PILOT_HOSTS`, `INGEST_PROXY_PILOT_TRIGGER_429_RATE`.
