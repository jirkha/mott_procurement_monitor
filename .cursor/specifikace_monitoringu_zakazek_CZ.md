# Specifikace aplikace pro monitoring veřejných zakázek v dopravním plánování (CZ verze)

## 1. Přehled aplikace
Aplikace bude automatizovaně vyhledávat a monitorovat relevantní veřejné zakázky v ČR v oblasti **dopravního plánování**, normalizovat jejich obsah a zobrazovat uživatelům přehledy podle filtrů. Cílem je eliminovat časovou náročnost manuálního procházení portálů a zlepšit zachycení relevantních příležitostí.

### 1.1 Uživatelé
- Interní uživatelé (transport planning / engineering)
- Administrátoři systému

### 1.2 Hlavní funkce
1. Monitoring zdrojů (API/RSS/scraping).
2. Normalizace dat do jednotného formátu.
3. Deduplikace zakázek z více zdrojů.
4. Filtrování podle disciplín, typu zakázky, klíčových slov.

### 1.2.1 Princip sběru u dopravních zadavatelů (obor vs. zdroj)

**Cíl nasazení:** maximalizovat pokrytí zakázek u **dopravních zadavatelů** v ČR (viz pracovní mřížka `.cursor/mrizka_dopravnich_zadavatelu_CZ.md`).

**Důležité:** Zakázky u těchto zadavatelů nemusí být formálně v „dopravní“ kategorii — často jde např. o **právní služby, IT, poradenství, správu majetku** apod., které stejně ovlivní přípravu či provoz dopravy. Proto:

- při napojení na **profil zadavatele** (NEN XML export, E‑ZAK přehled zakázek, příp. NKOD CSV řádků) se **nesbírá jen podmnožina podle druhu zakázky nebo CPV na portálu**; berou se řízení v technickém dosahu konektoru (časové okno, dostupná stránka);
- **výběr „co je pro nás dopravně relevantní“** patří do aplikace: klasifikátor (disciplíny a rozšiřitelná klíčová slova), přehled **nekategorizovaných** (`includeUnclassified`) a později ruční štítky / přiřazení;
- rozšiřování zdrojů probíhá **systematicky podle mřížky** (nejprve dohledat ověřené URL, pak zápis do `source-config.ts`).
5. Uživatelské rozhraní (user + admin) pro prohlížení zakázek, správa štítků a zodpovědných osob.
6. Logování, monitoring chyb.
7. Notifikace **pouze v rámci aplikace** (nikoli e‑mailem apod.).
8. Sběr zakázek bude probíhat **pouze ručně**: při spuštění aplikace nebo kliknutím na tlačítko **Aktualizovat**.

### 1.2.2 UI a databáze po změně kódu ingestu

Přehled zakázek bere data z **databáze** (Prisma), ne z živého stahování při každém načtení stránky. Po úpravách fetcherů / parserů v `apps/web/src/lib/ingestion/` je nutné **znovu spustit sběr**, jinak UI ukazuje staré hodnoty.

- **Z příkazové řádky (doporučeno pro vývoj):** z kořene monorepa `npm run ingest` (skript `apps/web/scripts/run-ingest.ts`, totéž co `runIngestion` u `POST /api/refresh`).
- **Z aplikace:** tlačítko **Aktualizovat** / admin `POST /api/refresh`.
- Podrobný postup a pokyny pro asistenty: `.cursor/WORKFLOW_UI_PO_INGESTU.md`. Obecná údržba všech souborů v `.cursor/` po změnách kódu: **§3.3.1**.

### 1.3 Postup tvorby

Byla již vytvořena demo verze aplikace propojené s jinou aplikací, na kterou tento projekt volně naváže. Zde jsou pokyny k propojení. Je nutné si vyžádat cestu k předchozí demo verzi projektu.

**Aktuální rozhodnutí:** Aplikace monitoringu se zakládá jako **nový samostatný projekt** (vlastní adresář / vlastní git repo). Repozitář **`personal_page` se nemění** — slouží jen jako zdroj, odkud se případně zkopírují vybrané soubory z předchozí verze (nebo jako reference). Vývojové závislosti (`npm install` atd.) patří **pouze do nového projektu**.

**Umístění projektu:** `C:\Users\vecko\jp_2.0\mott_procurement_monitor` (monorepo: `apps/web`, `packages/db`, …).

**Vizuální základ UI:** převzat z demo rozhraní v `personal_page` — soubor `app/demo-monitor/client.tsx` (rozvržení, barvy slate/modrá, karty zakázek, filtry, primární tlačítko). V novém projektu odpovídá komponenta `apps/web/src/components/zakazky-monitor-client.tsx`.

1. ~~Vytvořit nový repozitář / složku projektu s monorepo strukturou~~ → založeno v `mott_procurement_monitor`
2. ~~`npx create-next-app` v `apps/web/`~~ → hotovo
3. ~~`npx prisma init` v `packages/db/`~~ → hotovo (schéma + migrace)
4. ~~Zkopírovat z předchozí verze mimo jiné `classifier.ts`, `fetcher.ts`, `ezak_fetcher.ts`~~ → v `apps/web/src/lib/ingestion/` (zdroj: `personal_page/lib/`, úpravy pro `cache: "no-store"` a typ `IngestedZakazka`)
5. ~~Vytvořit Prisma schema (Zakazka, User, Label, Source a související entity)~~ → `packages/db/prisma/schema.prisma` + migrace (vč. `Source.slug`, `Zakazka.disciplina`, `keywords`, `recordUpdatedAt`)
6. ~~Adaptovat fetchery na zápis do DB místo in-memory~~ → první zdroje: `ingest-to-db.ts`, POST `/api/refresh`, `IngestionRun` (rozšíření zdrojů viz bod 8)
7. **Základní uživatelské prostředí** + volitelná ochrana tras: aplikační shell, navigace, seznam zakázek, detail zakázky, oblast správy. **Bez nastavení `AUTH_SECRET`** zůstávají stránky a API lokálně otevřené (výchozí vývoj). Po nastavení `AUTH_SECRET` middleware vyžaduje přihlášení (`/login`, JWT cookie) pro aplikaci i chráněné API (`/api/refresh`, `/api/zakazky`, …); vypnutí ochrany: `AUTH_DISABLED=1`.
8. **Rozšířit stahování** zakázek na **všechny relevantní zdroje** dle §3 (VVZ/RSS, další profily, komerční portály podle potřeby atd.). → průběžně: konfigurace veřejných zdrojů v `apps/web/src/lib/ingestion/source-config.ts`; rozšiřování **systematicky dle** `.cursor/mrizka_dopravnich_zadavatelu_CZ.md` (NEN jen ověřené slugy platného profilu; E‑ZAK / NKOD CSV dle ověření). Konektory: `fetcher.ts`, `ezak_fetcher.ts`, `vvz_fetcher.ts`, `nkod_fetcher.ts`.
9. **Přihlašování a práva (lokální účty dle §6.6):** implementováno — JWT session cookie, role `ADMIN`/`USER` v DB; první účet: `npm run db:seed-admin` s `MOTT_ADMIN_PASSWORD`. **Autorizace rolí** v UI/API lze dále zpřesnit.
10. ~~Připravit `services/ingestion/` (Python) pro pozdější fázi~~ → základ `services/ingestion/requirements.txt` (doplnění Crawlee/Playwright později)

**Rozhodnutí k pořadí:** sběr (bod 8) má přednost před vymýšlením složité role‑policy; základní přihlášení a ochrana tras je zavedeno tak, aby šlo zapnout nastavením `AUTH_SECRET` a nebránilo dalšímu rozšiřování konektorů.

**Poznámka:** Aplikace bude nejprve provozována a testována **v lokálním prostředí počítače** a následně přenesena **na server a doménu**, které dodám později.

Pokud se v průběhu tvorby rozhodneme pro úpravu postupu, je třeba vždy obsah tohoto souboru pozměnit tak, aby byl stále aktuální. 

---

## 2. Disciplíny a klíčová slova

| Disciplína | Klíčová slova |
|------------|----------------|
| Dopravní modelování | model, VISUM, mikromodel, prognóza |
| Dopravně-inženýrské studie | DI, POSU, kapacitní, studie proveditelnosti |
| Veřejná doprava | MHD, jízdní řád, IDS, dopravní podnik |
| Cyklo a pěší doprava | cyklo, cyklostezka, pěší, prostupnost |
| Udržitelná mobilita | PUM, SUMP, mobilita |
| ITS a telematika | ITS, SSZ, telematika |
| Parkování | P+R, parkování, parkovací |
| Bezpečnost | audit |

Každá disciplína má stále rozšiřovatelný seznam klíčových slov. Seznam může být dále upravován.
Seznam disciplín a klíčových slov bude editovatelný z admin prostředí webové aplikace.

### 2.1 Dva významy „relevance“ vůči zadání

| Pojem | Význam | Praktické dopady v aplikaci |
|--------|--------|-----------------------------|
| **Relevance oboru (dopravní plánování dle §2)** | Zakázka odpovídá alespoň jedné disciplíně a klíčovým slovům z tabulky výše — automatická shoda klasifikátoru. | Výchozí přehled může zobrazovat především tyto záznamy (filtrování podle `disciplina`). |
| **Relevance u konkrétního zadavatele (strategická)** | U **dopravních zadavatelů** (mřížka zadavatelů) může být pro přípravu nebo provoz dopravy významná i zakázka bez přímé shody §2 — např. IT, právní služby, správa majetku (viz §1.2.1). | Takové záznamy zůstávají v databázi; triáž je v režimu **nekategorizovaných** a podle zdroje (výběr zdroje ve filtrech), bez samostatného příznaku „mřížka“ v aplikaci. |
| **Irelevantní vůči zadání** | Po lidské kontrole: zakázka se netýká dopravního plánování v užším ani strategickém smyslu pro potřeby týmu. | Status `IRRELEVANT` — výchozí dotazy a přehledy je **nevybírají**; lze zobrazit volitelným filtrem. |

Automatika nesmí mazat záznamy ani je vynechat ze sběru u profilů zadavatelů z důvodu „chybí klíčové slovo“ (§1.2.1). Eliminace irelevantních zakázek je tedy především **zobrazením, filtrem a ručním označením**, nikoli zásahem do rozsahu ingestu.

---

## 3. Zdroje zakázek (ČR) — počáteční sada

| Zdroj | Typ | Metoda | Poznámky |
|---|---|---|---|
| NEN | veřejný | API + scraping | API omezené, kombinovat se scrapingem |
| VVZ / IS VZ | veřejný | RSS + scraping | stabilní struktura |
| Profily zadavatelů | veřejný | scraping | různé implementace (E‑ZAK, TenderArena) |
| E‑ZAK | komerční | API + scraping | každý klient má vlastní subdoménu |
| TenderArena | komerční | scraping | vyžaduje simulaci session |
| NajdiVZ | komerční | XML/API export + listing scraping | pilotní/backlog agregátor (NO-GO trend) |
| JOSEPHINE | komerční | scraping | aktivně integrovaný zdroj; produkční název v aplikaci **JOSEPHINE** |
| Gemin | komerční | scraping (homepage + `/verejne-zakazky`) | **Pilot NO-GO** (2026-04); konektor volitelný, vypnutí `INGEST_PILOT_DISABLE_GEMIN=1` |

Jedná se o počáteční zdroje zakázek. V průběhu tvorby je nutné prohledat i ostatní vhodné zdroje. Cílem je pokrýt všechny zdroje, aby nedošlo k opomenutí jakékoliv relevantní zakázky.

### 3.1 Definice „pokrytí všech zdrojů“ pro tento projekt

V tomto projektu znamená „pokrytí všech zdrojů“:

- **CZ veřejné zdroje**: NEN, VVZ/IS VZ, profily zadavatelů (včetně E-ZAK/TenderArena/PROEBIZ/eGORDION), NKOD datové sady relevantní pro veřejné zakázky.
- **CZ komerční zdroje**: portály a agregátory relevantní pro dopravní sektor (minimálně E-ZAK, TenderArena, Tenders.cz, JOSEPHINE, Gemin), pokud jsou technicky a právně použitelné.
- U každého zdroje se vede stav: **aktivně integrované / k ověření / backlog**.
- U klíčových zadavatelů se preferuje **primární + fallback** zdroj, aby výpadek jednoho kanálu neznamenal výpadek pokrytí.

### 3.2 Prioritizace doplňování zdrojů

1. **Vysoká priorita:** veřejné zdroje s opakovatelným výstupem (XML/RSS/HTML/CSV) a chybějící profily významných dopravních zadavatelů.
2. **Střední priorita:** komerční portály s vysokou pravděpodobností unikátních zakázek oproti veřejným agregátům.
3. **Nižší priorita:** zdroje s vysokou technickou bariérou (headless/CAPTCHA/login) nebo nízkým přínosem.

> **Živý inventář zdrojů (ověřené URL, API, RSS, doporučené pořadí):**  
> `.cursor/inventar_zdroju_verejnych_zakazek_CZ.md` — průběžně doplňovat při implementaci jednotlivých konektorů.

### 3.3 Synchronizace dokumentace a implementace

Při každé změně zdrojů musí být aktualizovány **všechny tři dokumenty**:

1. `.cursor/specifikace_monitoringu_zakazek_CZ.md` (pravidla a rozsah),
2. `.cursor/inventar_zdroju_verejnych_zakazek_CZ.md` (stav a priority zdrojů),
3. `.cursor/mrizka_dopravnich_zadavatelu_CZ.md` (mapování zadavatel → primární/fallback kanál).

A současně musí být změna promítnuta do `apps/web/src/lib/ingestion/source-config.ts`.

**Odstraněné zdroje:** Profil E‑ZAK Ministerstva financí (`mfcr.ezak.cz`) byl z ingestu odebrán (2026-04 — neaktuální data). Historické záznamy v DB lze smazat skriptem `npm run db:remove-source` (viz kořenový `package.json`).

**Provozní kontrola kvality odkazů:** po ingestu nebo před releasem lze spustit `npm run ingest:health-check` — náhodný vzorek `sourceUrl` z DB, detekce typických chybových stránek (např. NEN „stránka neexistuje“), HTTP 429 a chybějícího termínu kde ho lze ve stránce odhalit jednoduchým vzorem.

#### 3.3.1 Údržba dokumentace v `.cursor` po změnách kódu (obecně)

Pravidlo §3.3 se vztahuje na změny **zdrojů a URL**. Kromě toho platí: po **každé smysluplné úpravě kódu** krátce posoudit, zda je potřeba aktualizovat některý soubor v `.cursor/*.md`, aby dokumentace zůstala věrná repozitáři (cesty, příkazy, env proměnné, chování API a UI, architektura). Stejný princip doplňuje obecnou poznámku v úvodu dokumentu o udržování aktuálnosti specifikace.

**Orientační checklist podle oblasti změny:**

| Oblast změny | Kam se podívat / co upravit |
|--------------|------------------------------|
| Ingest, fetchery, parsování (`apps/web/src/lib/ingestion/`) | §1.2.2, §3.3, §6.3, §8; `.cursor/WORKFLOW_UI_PO_INGESTU.md`; při nových zdrojích navíc inventář a mřížka dle §3.3 |
| Konfigurace zdrojů (`source-config.ts`) | §3.3 (všechny tři dokumenty + `source-config.ts`) |
| Autentizace, chráněná API, role | §6.6, §8 |
| Nové nebo přejmenované npm skripty / příkazy zmíněné v dokumentaci | Tento soubor a `.cursor/inventar_zdroju_verejnych_zakazek_CZ.md` (tabulky příkazů), případně §10 struktura repa |
| Architektura modulů (Next.js, DB, Python) | §4, §5, §10 |

Cílem je **nutná konstantní aktuálnost** podkladů pro lidi i pro asistenty; vynechat aktualizaci jen tehdy, pokud změna zjevně nemění nic, co je v `.cursor` popsáno.

### 3.4 Nejbližší implementační checklist (`source-config.ts`)

Pořadí navazujících kroků pro rozšíření zdrojů:

1. **NEN slugy přidávat pouze po pozitivním ověření XML exportu** (odpověď není „Profil ... neexistuje“).
2. **E-ZAK portál přidat až po potvrzení vzoru `contract_index.html` + dostupných detailů `contract_display_*`.**
3. **U nejednoznačných kandidátů** (HTTP 200 bez E-ZAK vzoru, DNS chyby, timeout) ponechat stav „K ověření“ a nezapisovat do aktivní konfigurace.
4. **Fallback zachovat přes VVZ RSS**, dokud není potvrzen primární profil zadavatele.
5. **Po každém přidání zdroje** ověřit ingest ručně přes tlačítko Aktualizovat a zkontrolovat logy.

### 3.5 Průběžně ověřené rozšíření (aktuální stav)

- **Ministerstvo financí (E‑ZAK `mfcr.ezak.cz`)** bylo z aktivního ingestu odebráno (2026-04) kvůli neaktuálnosti profilu; stav a počty E‑ZAK portálů viz `.cursor/mrizka_dopravnich_zadavatelu_CZ.md`.
- Byl ověřen a přidán zdroj **České Budějovice (eGORDION)** přes XML endpoint:
  `https://www.egordion.cz/nabidkaGORDION/profilgordionBudejovice/XMLdataVZ`.
- Byl ověřen a přidán zdroj **Olomouc město (EVEZA)** přes XML endpoint:
  `https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/XMLdataVZ`.
- Byl ověřen a přidán zdroj **DPMO Olomouc (TenderArena)** přes XML endpoint:
  `https://www.tenderarena.cz/profily/DPMOas/XMLdataVZ`.
- Byl ověřen a přidán zdroj **ČEPS (TenderArena)** přes XML endpoint:
  `https://www.tenderarena.cz/profily/CEPS/XMLdataVZ`.
- Byl ověřen a přidán zdroj **DPMB Brno (PROEBIZ)** přes XML endpoint:
  `https://profily.proebiz.com/profile/25508881/XMLdataVZ`.
- Byl ověřen a přidán zdroj **Hradec Králové (TenderArena)** přes XML endpoint:
  `https://www.tenderarena.cz/profily/hradeckralove/XMLdataVZ`.
- Byl ověřen a přidán zdroj **DPMLJ (Liberec/Jablonec)** přes profilový E-ZAK endpoint:
  `https://zakazky.liberec.cz/contract_index_482.html`.
- Byl ověřen a přidán zdroj **DPMP Pardubice (TenderArena)** přes XML endpoint:
  `https://www.tenderarena.cz/profily/DPMP/XMLdataVZ`.
- Byl ověřen a přidán zdroj **DPMÚL Ústí nad Labem (TenderArena)** přes XML endpoint:
  `https://www.tenderarena.cz/profily/DPMUL/XMLdataVZ`.
- Byl ověřen a přidán zdroj **DP Mladá Boleslav (TenderArena)** přes XML endpoint:
  `https://www.tenderarena.cz/profily/DPMLB/XMLdataVZ`.
- Zjištěné neplatné kandidáty NEN slugů (např. pro SŽ a ČD) se do aktivní konfigurace nepřidávají.
- U **Správy železnic** zatím nebyl nalezen platný TenderArena XML slug (ověřené kandidáty vrací „Profil zadavatele nenalezen“), proto zůstává primární zdroj E-ZAK + fallback VVZ.
- Pro **MMR/NKOD** byly ověřeny celostátní XML distribuce „Zadané VZ podle typu/druhu“ (`isvz.nipez.cz`), ale jde o statistická agregovaná data; bez samostatné transformace se nehodí jako přímý ingest jednotlivých zakázek.
- Pro **MMR/NKOD** je nově implementovaný samostatný **analytický ingest** agregovaných XML sad (odděleně od `IngestedZakazka`): výstupem jsou metriky (počty řádků, poslední rok dat, metadata URL), které se vrací ve statistikách `/api/refresh`.
- V UI správy sběru je pro NKOD/MMR agregace zavedený **health indikátor** (`OK` / `Warning`) podle aktuálnosti dat (`latestYear`) a počtu řádků (`rowCount`).
- **Komerční agregátory (aktuální režim):** **JOSEPHINE** je aktivně integrovaný zdroj (mimo pilot). `NajdiVZ` a **Gemin** zůstávají v pilot/backlog režimu dle metrik stability a unikátnosti. `Tenders.cz` je v backlogu do potvrzení stabilního technického přístupu. Gemin lze vypnout env `INGEST_PILOT_DISABLE_GEMIN=1`.
- **Gemin — uzavření pilotu (2026-04):** tři po sobě jdoucí běhy konektoru + jeden plný merge proti základním zdrojům: stabilní HTTP, nízký `extractedCount` z veřejných listingů, **0 klasifikovaných** dopravně relevantních položek a **0 unikátních** vůči VVZ/NEN/E‑ZAK/NKOD; automatický `goDecision: no-go`. Heuristika detekce anti-bot byla zúžena (sdílený modul `anti-bot-html.ts`), aby se eliminovaly falešné pozitivy z běžného HTML. **Závěr: NO-GO** — konektor ponechán jako volitelný (výchozí doporučení pro produkci: `INGEST_PILOT_DISABLE_GEMIN=1`, dokud produkt nerozhodne jinak).
- **TED / eForms (EU):** bez aktivního konektoru — po definici rozsahu (země, typ řízení) navrhnout integraci přes oficiální API; do té doby pouze zmínka v inventáři a mřížce.
- Pilot vrací metriky po každém běhu (`downloadedCount`, `uniqueVsExistingCount`, `duplicateVsExistingCount`, technická stabilita) a automatický návrh `GO/NO-GO` podle strict pravidla.
- Pilotní metriky byly rozšířeny o kvalitu parsingu/dedupe: `extractedCount`, `classifiedRatio`, `dedupeByUrlCount`, `dedupeByFallbackCount`, `stability.errorCode` a trend rozhodnutí z posledních běhů.
- Pro závěr pilotu se používá série běhů (min. 3; cílově 5+). Aktuální stav: **NajdiVZ = NO-GO (backlog)**; **Gemin = NO-GO** (uzavřeno 2026-04 dle metrik výše). **JOSEPHINE** byl na základě předchozích metrik povýšen do aktivní integrace.

---

## 4. Architektura systému (logické moduly)
- **Správa zdrojů** (aktivace, parametry, frekvence).
- **Sběr dat** (spouštěný uživatelem). 
- **Normalizace a parsování**.
- **Databázová vrstva**.
- **Deduplikace**.
- **Filtrování a scoring**.
- **Webové UI** (admin + user).
- **Logování a monitoring**.

### 4.1 Rozdělení odpovědností mezi TypeScript a Python
- **Next.js (TypeScript)** — webové rozhraní, API endpointy, čtení dat z databáze (Prisma ORM).
- **Python (Crawlee + Playwright)** — scraping workers v pozadí, stahování a parsování dat z portálů, zápis do databáze.
- Komunikace mezi oběma vrstvami probíhá **přes sdílenou PostgreSQL databázi** (Python zapisuje, Next.js čte).

---

## 5. Technologie

### 5.1 Vývojové nástroje
- Cursor (editor)
- Claude Code (CLI agent)
- Next.js + TypeScript
- Prisma ORM
- Crawlee & Playwright
- Python + TypeScript
- Git/GitHub

### 5.2 Provozní nástroje
- Coolify (self‑hosted)
- Hetzner Cloud (CX)
- **SQLite** pro lokální vývoj, **PostgreSQL** pro produkci
- Residential proxies (Bright Data / Smartproxy) — infrastruktura proxy pilotu implementována (`INGEST_PROXY_PILOT_ENABLED`, `INGEST_PROXY_URL`); aktivace po nasazení proxy služby.
- Proxy aktivace se řídí metrikou stability: po zavedení host-aware throttlingu se proxy pilot zapíná jen pro hosty s přetrvávajícím podílem `HTTP 429` (např. >20 % běhů v 3denním okně), ne globálně. Runtime setup proxy agenta přes `undici ProxyAgent` v `proxy-setup.ts`.
- **Optimalizace rychlosti ingestu (2026-04):** host-aware paralelizace XML profilů (různé hosty běží souběžně), domain-wide 429 circuit breaker (`INGEST_HOST_429_CONSECUTIVE_THRESHOLD`), přeskakování HTML enrichmentu pro záznamy s existujícím deadline, zkrácené NEN timeouty (20s default), automatická deaktivace NEN slugů s opakovaným selháním, paralelní běh NEN + generických profilů.
- **Hlídač státu API (2026-04):** Konektor `hlidac-statu_fetcher.ts` — fallback/validační zdroj pro NEN a TenderArena zadavatele. Vyhledávání zakázek podle IČO klíčových dopravních zadavatelů (`HLIDAC_STATU_PROCURERS` v `source-config.ts`). Aktivace: nastavit `HLIDAC_STATU_API_TOKEN` (registrace zdarma na `hlidacstatu.cz/api`). Bez tokenu se přeskočí. Licence CC BY 3.0.
- Sentry
- Docker

---

## 6. Funkční požadavky
### 6.1 Ingest / sběr dat
- Sběr dat probíhá **ručně**: při spuštění aplikace nebo tlačítkem **Aktualizovat**.
- Podpora API, RSS, scraping, headless scraping.
- Uložení normalizovaného záznamu.
- **Platformová bezpečnostní pravidla (TenderArena + NEN):** pokud detail obsahuje formulaci `přímé zadání` nebo `jednací řízení bez uveřejnění`, záznam se ze sběru vyřadí (defaultně zapnuto; vypnutí jen pro diagnostiku přes `INGEST_EXCLUDE_BLOCKED_PROCEDURE_TYPES=0`).

### 6.2 Normalizace
- Převedení zdrojových dat do jednotného formátu.
- Extrakce klíčových polí.
- Záznamy s neúplnými daty budou uloženy i bez všech polí — chybějící hodnoty se doplní jako `null`.

### 6.3 Deduplikace
- Spojování duplicitních záznamů podle shody údajů.
- **Aktuální pravidla ve sběru (`fetcher.ts`):**
  1. **URL:** po sloučení všech zdrojů se položky s totožnou normalizovanou URL (bez `#`, sjednocené řazení query parametrů, ořez koncového `/` na cestě) vyřadí až na jednu výskyt.
  1a. **Stable key (NEN/Tender-like):** navíc se vyřadí duplicity se stejným stabilním klíčem řízení vyčteným z URL (`nenlike:*`, `tender:*`, `q:*`) i když se URL textově liší.
  2. **Pilot vs. veřejné zdroje:** u pilotních komerčních agregátorů (`NajdiVZ`, `Gemin`) se proti již staženým **základním** zdrojům (NEN, E‑ZAK, VVZ, NKOD CSV a aktivní JOSEPHINE) počítá překryv dle **normalizované URL** a dle **fallback klíče**: normalizovaný název (až 32 tokenů), kalendářní měsíc z `datum_publikace` a buď **doména** URL, nebo — pokud z URL půjde vyčíst stabilní token řízení — prefix `nenlike:…`, `tender:…` (číslo řízení na portálu) či velké číselné `zakazkaId` v query. Tím se sníží dvojí započítání stejného řízení rozeskaného z VVZ a z portálu s `/tender/{id}/` apod.
  3. **Perzistence v DB (rozhodnutí 2026-04):** řádky `Zakazka` zůstávají **oddělené podle zdroje** (`sourceId` + `externalRef`). Slučování duplicit **napříč zdroji se provádí ve fázi sběru** (body 1–2), nikoli slučováním záznamů v databázi. Budoucí „canonical id“ nebo UI seskupení stejné zakázky z více portálů je možné navrhnout zvlášť; do té doby může přehled v aplikaci zobrazovat více řádků pro stejné řízení z různých URL.

### 6.4 Filtry & scoring
- Filtr podle disciplín, typu zakázky, klíčových slov.
- Relevance se bude upřesňovat později.
- Pravidla klasifikace musí minimalizovat falešné pozitivy: krátké zkratky (např. `DI`, `ITS`, `MHD`) se mají vyhodnocovat jako samostatné tokeny, ne jako podřetězce uvnitř běžných slov.

### 6.5 Web UI
- Seznam zakázek
- Detail zakázky
- Označení: viděno / neviděno, štítky, stav
- Přidělení zodpovědné osoby

### 6.6 Role a práva
- Minimálně dvě role: **admin**, **user** (detail bude doplněn v průběhu projektu).
- Autentizace je **lokálním přihlášením** (jméno + heslo): stránka `/login`, API `POST /api/auth/login`, cookie `mott_session` (JWT HS256, tajemství `AUTH_SECRET`). Odhlášení: `POST /api/auth/logout`. Seed administrátora: `npm run db:seed-admin` s proměnnou `MOTT_ADMIN_PASSWORD` (volitelně `MOTT_ADMIN_USERNAME`).
- Ochrana je **vypnutá**, dokud není nastaveno `AUTH_SECRET`; explicitní vypnutí i při nastaveném tajemství: `AUTH_DISABLED=1`.
- **API při zapnuté autentizaci:** `POST /api/refresh` pouze role **ADMIN**. `GET /api/zakazky` — každý přihlášený uživatel (`USER` i `ADMIN`). `POST /api/reclassify` — v produkci **ADMIN** nebo platný hlavičkový token `x-reclassify-token` shodný s `RECLASSIFY_TOKEN`; ve vývoji s nastaveným `RECLASSIFY_TOKEN` stejná hlavička, jinak otevřené.

### 6.7 Notifikace
- Notifikace **jen uvnitř aplikace** (žádný e‑mail, Teams apod.).

---

## 7. Nefunkční požadavky
- Modulární konektory.
- Odolnost vůči chybám.
- Bezpečné ukládání přihlašovacích údajů.
- Rozšiřitelnost zdrojů.

---

## 8. Testování & nasazení
- Aplikace bude **nejprve spuštěna lokálně** (vývojový počítač).
- Po otestování bude přenesena na **poskytnutý server a doménu** (Hetzner + Coolify).
- Po každé implementaci nebo úpravě funkce agent provede **samostatné ověření funkčnosti** (minimálně build/lint + relevantní runtime/API test) a výsledek stručně zapíše do průběžného reportu.
- Po změnách ovlivňujících **sběr z externích URL / parsování** navíc prověřit **výstup vývojového serveru** (`npm run dev`) na **varování a chyby v konzoli** (např. neplatné NEN slugy, HTTP chyby portálů) — build/lint to sám neodhalí.
- Servisní endpoint **re-klasifikace** (`POST /api/reclassify`): ve vývoji volitelně token v hlavičce; v produkci pouze s **ADMIN** relací nebo platným `RECLASSIFY_TOKEN`.

---

## 9. Otevřené body (zůstávají k doplnění)
1. Přesná pravidla relevance/scoringu.
2. **Deduplikace napříč perzistovanými řádky:** aktuálně **bez merge v DB**; pravidla ve sběru viz §6.3. Budoucí slučování řádků nebo canonical identifikátor lze navrhnout zvlášť.
3. Podrobný seznam polí v záznamech zakázky.
4. Detailní role a práva uživatelů.

---

## 10. Doporučená struktura repozitáře
- `apps/web/` — Next.js UI + API endpointy (TypeScript)
- `services/ingestion/` — Python scraping workers (Crawlee + Playwright), vlastní `requirements.txt`
- `packages/db/` — Prisma schema (sdílená databáze mezi Next.js a Python)
- `packages/shared/` — typy a utility

> **Pozn.:** Prvním krokem implementace bude vytvoření Prisma schématu v `packages/db/` — definice tabulek Zakazka, User, Label, Source apod.

---

## 11. Důvěrnost
Obsah dokumentu vychází z původních zdrojů označených jako interní / restriktivní. Repo i dokumentace mají zůstat neveřejné.
