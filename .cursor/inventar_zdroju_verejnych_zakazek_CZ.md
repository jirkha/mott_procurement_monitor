# Inventář zdrojů veřejných zakázek (ČR) — co sledovat a jak

**Účel:** Podklad pro postupnou implementaci sběru v aplikaci MOTT. Zaměření je na **strojově zpracovatelný** přístup (RSS, XML, dokumentované API, opakovatelný HTML vzor).  
**Kontext zájmu:** Dopravní plánování — v praxi stejně potřebujeme **širší agregáty** (VVZ, NEN, profily), filtrování probíhá až v aplikaci.

---

## 1. Metodika „ověření“

| Stav | Význam |
|------|--------|
| **Ověřeno v projektu** | Už napojeno nebo URL ručně ověřena při vývoji (HTTP + typ odpovědi). |
| **Dokumentováno oficiálně** | Existuje metodika / podpora NIPEZ, MMR, poskytovatel. |
| **K ověření při implementaci** | Konkrétní formát/API je nutné dořešit v terénu (swagger, přístupové právo, limity). |
| **Scraping / riziko** | Nutný headless, session, limity, CAPTCHA nebo smlouva. |

### 1.1 Stavový model pro implementaci

| Stav | Použití v projektu |
|------|--------------------|
| **Aktivně integrované** | Zdroj je zapojený v ingest pipeline a má ověřený výstup v projektu. |
| **K ověření** | Zdroj je relevantní, ale chybí finální technické ověření (URL, formát, limity, stabilita). |
| **Backlog** | Zdroj je evidovaný pro budoucí rozšíření (nižší priorita nebo vyšší bariéra). |

### 1.2 Priorita implementace

| Priorita | Kritérium |
|----------|-----------|
| **Vysoká** | Vysoký dopad na pokrytí dopravních zadavatelů a nízká technická bariéra. |
| **Střední** | Reálný přínos, ale vyšší pracnost nebo časté duplicity. |
| **Nízká** | Nízký přínos proti stávajícím zdrojům nebo významné technické/právní riziko. |

### 1.3 Kontrola kvality po ingestu (repozitář)

| Příkaz (kořen monorepa) | Účel |
|------------------------|------|
| `npm run ingest:health-check` | Vzorkuje `sourceUrl` z DB; detekuje 4xx/5xx, typické chybové stránky a neshodu termínu (HTML vs. `deadline`). |
| `npm run check:source-consistency` | Porovná počty zdrojů v `source-config.ts` s tabulkou v `.cursor/mrizka_dopravnich_zadavatelu_CZ.md`. |
| `npm run db:remove-source -- "Profil - …"` | Smaže všechny zakázky daného `Source.name` a zdroj (např. jednorázově po vyřazení portálu z ingestu). |

---

## 2. Kategorie A — Centrální státní infrastruktura (priorita vysoká)

### 2.1 NEN (Národní elektronický nástroj) — `nen.nipez.cz`

| Kanál | Typ | Poznámka | Stav |
|-------|-----|----------|------|
| Veřejné vyhledávání zakázek | Web UI | `https://nen.nipez.cz/verejne-zakazky` — základ pro manuální kontrolu; scraping může být křehký kvůli SPA. | Doplňkově |
| **XML export profilu zadavatele** | HTTP GET (XML) | URL tvar `https://nen.nipez.cz/profil/{KÓD_PROFILU}/XMLdataVZ?od=DDMMYYYY&do=DDMMYYYY`. **Segment `{KÓD_PROFILU}` musí odpovídat přesné hodnotě z URL profilu na NEN** (odhad zkratky typu „SFDI“ často vrátí text „Profil … neexistuje“). | **Ověřeno** (MDCR, RSD); další kódy doplnit z reálných odkazů |
| Veřejné API NEN | REST / Swagger | Swagger na `https://nen-ws.nipez.cz/PS01r/swagger/`. **Vyžaduje registraci, komerční certifikát a schválení provozovatelem** — nelze použít anonymně. | **Nepoužitelné bez registrace** |
| Export dokumentace ZP | Autentizovaný | Podle [podpory NEN — export dokumentace](https://podpora.nipez.cz/cs/zadavatel/latest/export-dokumentace) jde o export pro přihlášené zadavatele k **konkrétnímu** zadávacímu postupu — **není** univerzální veřejný feed všech zakázek. | Nepoužít jako agregát |

**Doporučení:** Pokračovat v **XML per profil** pro vybrané zadavatele (doprava, SFDI po nalezení správného kódu profilu, ŘSD, MD, kraje na NEN). Paralelně zmapovat **veřejné API** z Swaggeru (autentizace, limity, filtrování).

---

### 2.2 VVZ / IS VZ (Věstník, portál MMR) — `vvz.nipez.cz`, `portal-vz.cz`, IS VZ

| Kanál | Typ | Poznámka | Stav |
|-------|-----|----------|------|
| **RSS** | RSS/XML | `https://vvz.nipez.cz/rss/zakazky.xml`, `https://vvz.nipez.cz/rss/vvz.xml` — vhodné pro pravidelný sběr titulků a odkazů. | **Ověřeno v projektu** |
| Web VVZ | SPA | Hlavní rozhraní — scraping náročnější; RSS dostačuje pro první vrstvu. | Záložně |
| Portál o VZ | Informační | `https://portal-vz.cz/` — metodiky, odkazy na NIPEZ, RVZ, plánovaná Open data. | Odkazy |
| IS VZ (informační systém) | Různé | `https://skd.nipez.cz/isvz/…` — např. SKD, metodické podklady; **ne vše** je veřejným strojovým výpisem zakázek jako jedna tabulka. | Podle potřeby |

---

### 2.3 Registr veřejných zakázek (RVZ) — součást NIPEZ

| Kanál | Typ | Poznámka | Stav |
|-------|-----|----------|------|
| Pravidla a popis | Dokumentace | [Pravidla použití RVZ](https://podpora.nipez.cz/cs/pravidla-pouziti-registru-verejnych-zakazek/latest), [RVZ na portálu VZ](https://www.portal-vz.cz/nipez/registr-verejnych-zakazek/). RVZ slouží k uchovávání a **výdeji** dat oprávněným způsobem (včetně napojení na datové fondy). | **Dokumentováno oficiálně** |
| API / ESB | Integrační | V materiálech se zmiňují prostředí `https://esb-test.nipez.cz/`, `https://esb-ref.nipez.cz/` — typicky pro **registrované** integrace, ne anonymní „veřejné API všech zakázek“. | **K ověření při implementaci** (oprávnění, smluvní rámec) |

**Doporučení:** Zařadit jako **samostatnou analýzu**: zda lze pro interní nástroj získat přístup bez zbytečné duplicity oproti VVZ RSS + NEN XML.

---

### 2.4 Národní katalog otevřených dat — `data.gov.cz`

| Kanál | Typ | Poznámka | Stav |
|-------|-----|----------|------|
| Datové sady „veřejné zakázky“ | CSV/XML podle sady | Vyhledávání: `https://data.gov.cz/datové-sady` + klíčová slova. Příklady z hledánek: **MMR — zadané VZ** (XML z Věstníku), **OICT Praha** (CSV zakázek), datové sady **NKÚ** (kontroly, ne průběžný trh). | **Částečně ověřeno** |

**Ověřené MMR celostátní datasety (NKOD metadata):**

- `https://isvz.nipez.cz/sites/default/files/content/opendata/Zadané%20Veřejné%20Zakázky%20podle%20Typu-cs.xml`
- `https://isvz.nipez.cz/sites/default/files/content/opendata/Zadané%20Veřejné%20Zakázky%20podle%20Druhu-cs.xml`

**Poznámka k použitelnosti pro ingest:** Tyto MMR XML sady jsou primárně **statistické agregace** (rok, zadavatel, typ/druh, počty a hodnoty), nikoli plnohodnotný feed jednotlivých zakázek pro monitoring detailů. Pro aktuální pipeline proto zůstávají **doplňkový analytický zdroj** (ne primární ingest zakázek).

---

## 3. Kategorie B — Profily zadavatelů (veřejné HTML / jednotný vzor E‑ZAK)

Typicky: `…/contract_index.html` + `contract_display_*.html` (jako v aktuálním `ezak_fetcher.ts`).

| Skupina | Příklady / zdroj odkazů | Metoda | Poznámka |
|---------|-------------------------|--------|----------|
| **Multiprofil E‑ZAK (vendor)** | Přehled zadavatelů: `https://ezak.cz/zadavatele`, koncept multiprofilů: `https://ezak.cz/multiprofil-zadavatele` | Scraping indexů + jednotné šablony | Postupně doplňovat **ověřené** `baseUrl`; každý subdoménový portál zvlášť. |
| **Státní orgány na E‑ZAK** | např. ÚV: `zakazky.vlada.cz`, MPSV, EAGRI, SPÚ… (dle `EZAK_PORTALS`) | Stejný vzor | Profil MF (`mfcr.ezak.cz`) **není v ingestu** (2026-04: neaktuální zdroj). |
| **Kraje a města** | Různé domény (`ezak.*`, `zakazky.*`, vlastní) | Stejný vzor **nebo** jiný engine (TenderArena, …) | Nutné **URL po URL** (viz již Pardubice, Středočeský, Liberec v `source-config.ts`). |
| **In-house / jiný SW** | Např. některé organizace bez `contract_index.html` | Scraping na míru | Vyžaduje analýzu DOM / případně headless. |

**Doporučení:** Udržovat **`source-config.ts`** jako pravdu; pro „úplný“ seznam systematically projít: seznam krajů, statutární města, Dopravní podniky, SFDI, ŘSD, Správa železnic (duplicitně NEN+E‑ZAK kontrolovat deduplikací).

---

### 3.2 TenderArena — `tenderarena.cz`

**Klíčový objev:** Přestože TenderArena je SPA (Angular), nabízí **veřejný XML export** na:
```
https://www.tenderarena.cz/profily/{SLUG}/XMLdataVZ?od=DDMMYYYY&do=DDMMYYYY
```
Formát je **identický** se standardem NEN / PROEBIZ / eGORDION (vyhláška č. 345/2023 Sb.). Pozor: cesta je `/profily/` (s „y"), nikoli `/profil/` (SPA frontend). Rate-limiting platí i pro XML endpoint.

| Slug | Zadavatel | Stav |
|------|-----------|------|
| `DPP` | Dopravní podnik hl. m. Prahy | **Aktivně integrované** |
| `CD` | České dráhy | **Aktivně integrované** |
| `HlavniMestoPraha` | Magistrát hl. m. Prahy | **Aktivně integrované** |
| `JihoceskyKraj` | Jihočeský kraj | **Aktivně integrované** |
| `Ostrava` | Statutární město Ostrava | **Aktivně integrované** |
| `CEPS` | ČEPS, a.s. | **Aktivně integrované** |
| `DPMOas` | Dopravní podnik města Olomouce, a.s. | **Aktivně integrované** |
| `hradeckralove` | Statutární město Hradec Králové | **Aktivně integrované** |
| `DPMP` | Dopravní podnik města Pardubic a.s. | **Aktivně integrované** |
| `DPMUL` | Dopravní podnik města Ústí nad Labem a.s. | **Aktivně integrované** |
| `DPMLB` | Dopravní podnik Mladá Boleslav, s.r.o. | **Aktivně integrované** |

### 3.3 PROEBIZ — `profily.proebiz.com`

XML export na `/profile/{IČO}/XMLdataVZ?od=…&do=…` — standardní formát.

| Profil | Zadavatel | Stav |
|--------|-----------|------|
| `61974757` | DPO Ostrava | **Aktivně integrované** |
| `25508881` | Dopravní podnik města Brna, a.s. | **Aktivně integrované** |

### 3.4 eGORDION — `egordion.cz`

XML export na `/nabidkaGORDION/{slug}/XMLdataVZ?od=…&do=…` — standardní formát.

| Slug | Zadavatel | Stav |
|------|-----------|------|
| `profilOlomouckykraj` | Olomoucký kraj | **Aktivně integrované** |
| `profilgordionBudejovice` | Statutární město České Budějovice | **Aktivně integrované** |

### 3.5 EVEZA — `eveza.cz`

XML export je dostupný i přes profil zadavatele:
`/profil-zadavatele/{slug}/XMLdataVZ?od=...&do=...` (stejný standard XML).

| Slug | Zadavatel | Stav |
|------|-----------|------|
| `statutarni-mesto-olomouc` | Statutární město Olomouc | **Aktivně integrované** |

---

## 4. Kategorie C — Komerční portály a agregátory (specifikace §3)

| Zdroj | Typ | Stav | Priorita | Poznámka |
|-------|-----|------|----------|----------|
| **E-ZAK** | HTML/API podle profilu | Aktivně integrované | Vysoká | V projektu napojené přes konkrétní profily zadavatelů. |
| **TenderArena** | XML export profilu + SPA | Aktivně integrované | Vysoká | Preferovat XML endpoint `/profily/{slug}/XMLdataVZ`. |
| **JOSEPHINE** | Scraping | **Aktivně integrované** | Střední | Produkční zdroj mimo pilotní režim; průběžně sledovat stabilitu a unikátnost vůči veřejným zdrojům. |
| **NajdiVZ** | XML/API export + listing scraping | Backlog | Střední | Pilot (5 běhů) bez unikátních záznamů, opakovaný anti-bot signál => NO-GO (ponechat backlog). |
| **Tenders.cz** | Scraping + limity | Backlog | Nízká | Dočasně odloženo do potvrzení stabilního technického přístupu (API/export/ToS). |
| **Gemin** | Scraping (homepage + `/verejne-zakazky`) | **Backlog** | Nízká | Pilot uzavřen 2026-04 jako NO-GO (3× běh + plný merge: 0 klasifikovaných dopravních položek, 0 unikátních vůči základním zdrojům). Stub `Source` zůstává; doporučeno `INGEST_PILOT_DISABLE_GEMIN=1` v produkci. Anti-bot heuristika: `anti-bot-html.ts`. |

**Doporučení:** Až po pokrytí **veřejných** zdrojů; u každého právní posouzení ToS a technické limity.

---

## 5. Kategorie D — Nadnárodní (doplněk)

| Zdroj | Typ | Poznámka |
|-------|-----|----------|
| **TED / notices** (`ec.europa.eu`) | API (oficiální) + formáty eForms | Vhodné pro nadnárodní řízení a české zadavatele uveřejňující v EU; slovenské/polské řízení apod. |

**Stav v repu (2026-04):** žádný aktivní konektor TED — až po zadání rozsahu (státy, filtry) a volbě oficiálního API.

**Doporučení:** Volitelná fáze po stabilizaci ČR.

---

## 6. Shrnutí — co je vhodné sledovat (doporučená množina)

**Deduplikace v DB:** řádky `Zakazka` se neslučují napříč zdroji; překryvy se řeší ve sběru před upsertem (viz spec §6.3).

1. **VVZ RSS** — nízkonákladový, široký těž.  
2. **NEN XML** — pro **konkrétní** profily s ověřeným kódem v URL.  
3. **Veřejné profily E‑ZAK / zakazky.*** — rozšířený seznam v `source-config.ts` + pravidelná kontrola konzole.  
4. **data.gov.cz** — vybrané sady (MMR, případně kraj/město). *2026-04:* žádná nová řádková NKOD sada nebyla přidána (stávající CSV + MMR analytika dostačují oproti riziku agregátů bez detailů zakázek).  
5. **NIPEZ veřejné API / RVZ** — po právně‑technické analýze (náhrada nebo doplněk manuálního skládání).  
6. **Komerční agregátory** — podle potřeby a oprávnění.  
7. **TED** — podle potřeby přeshraničních zakázek.

## 6.1 Navržené další zdroje pro plné CZ pokrytí (veřejné + komerční)

1. **NKOD (MMR a celostátně relevantní datasety)** — doplnit vedle OICT minimálně jednu celostátně přínosnou sadu.  
2. **Chybějící profily statutárních měst a dopravních organizací** — prioritně položky vedené jako „K ověření“ v mřížce.  
3. **Komerční agregátory z §4** — ověřit technickou použitelnost a unikátní přínos proti VVZ/NEN.  
4. **Doplňkové NIPEZ/RVZ integrační cesty** — držet jako „K ověření“, pokud přinesou data bez nadměrné duplicity.
5. **SFDI a další chybějící dopravní zadavatelé bez dedikovaného profilu** — vést explicitně jako `K ověření`/`Backlog` do doby pozitivního technického ověření.

## 6.2 Operativní shortlist pro další změny v `source-config.ts`

| Kandidát | Aktuální zjištění | Doporučený krok | Stav |
|----------|-------------------|-----------------|------|
| **Olomouc město** | Ověřen XML endpoint `https://www.eveza.cz/profil-zadavatele/statutarni-mesto-olomouc/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **České Budějovice** | Ověřen XML endpoint `https://www.egordion.cz/nabidkaGORDION/profilgordionBudejovice/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **ČEPS** | Ověřen XML endpoint `https://www.tenderarena.cz/profily/CEPS/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **DPMB Brno** | Ověřen XML endpoint `https://profily.proebiz.com/profile/25508881/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **Hradec Králové (město)** | Ověřen XML endpoint `https://www.tenderarena.cz/profily/hradeckralove/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **DPMP Pardubice** | Ověřen XML endpoint `https://www.tenderarena.cz/profily/DPMP/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **DPMÚL Ústí nad Labem** | Ověřen XML endpoint `https://www.tenderarena.cz/profily/DPMUL/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **DP Mladá Boleslav** | Ověřen XML endpoint `https://www.tenderarena.cz/profily/DPMLB/XMLdataVZ`. | Přidáno do `source-config.ts` jako aktivní zdroj. | Aktivně integrované |
| **DPMLJ (Liberec/Jablonec)** | Ověřen profilový E-ZAK endpoint `https://zakazky.liberec.cz/contract_index_482.html`. | Přidáno do `EZAK_PORTALS` jako samostatný profilový zdroj. | Aktivně integrované |
| **MMR NKOD (Zadané VZ podle typu/druhu)** | Ověřené přímé XML distribuce z `isvz.nipez.cz`. | Implementován samostatný analytický ingest (metriky), neparsuje se do `IngestedZakazka`. | Aktivně integrované (analyticky) |
| **Správa železnic (NEN slugy SZ/SpravaZeleznic/SZ_DC)** | XML endpoint vrací „Profil neexistuje“. | Nepřidávat do `NEN_PROFILE_SLUGS`; ponechat E-ZAK + VVZ fallback. | Backlog |
| **Správa železnic (TenderArena slugy SpravaZeleznic/SpravaZeleznicniDopravniCesty/SZDC/SZ)** | XML endpoint vrací serverovou chybu (`HTTP 500`) nebo „Profil zadavatele nenalezen“ podle varianty URL. | Nepřidávat do `XML_PROFILY_ZADAVATELU`; ponechat E-ZAK + VVZ fallback, periodicky re-testovat. | Backlog |
| **České dráhy (NEN slugy CD/CeskeDrahy)** | XML endpoint vrací „Profil neexistuje“. | Nepřidávat do `NEN_PROFILE_SLUGS`; ponechat TenderArena XML + VVZ fallback. | Backlog |
| **DPMHK** | **Ověřeno záporně (2026-04):** API TenderArena pro `/profily/DPMHK/XMLdataVZ` vrací JSON „Profil zadavatele nenalezen“; profil města HK (`hradeckralove`) je jiný subjekt. | Samostatný řádek v `XML_PROFILY_ZADAVATELU` / E‑ZAK **nepřidáván**. Pokrytí zakázek DP jako zadavatele přes **VVZ RSS** (již v projektu) a kontext městského/krajského profilu dle potřeby. | Backlog |
| **SFDI (NEN/TenderArena/E‑ZAK kandidáti)** | **Ověřeno záporně (2026-04-09):** NEN slugy `SFDI`, `SFDI_CR`, `StatniFondDopravniInfrastruktury` vrací „Profil neexistuje“; TenderArena kandidáti vrací `HTTP 500`; E‑ZAK odhad `zakazky.sfdi.cz` není dosažitelný (`fetch failed`). | Dedikovaný profil zatím nepřidávat; ponechat pokrytí přes VVZ RSS a pokračovat v periodickém ověřování kandidátů. | K ověření |

---

## 7. Co dál v repu

- Implementace podle tohoto inventáře **postupně**; před každým novým zdrojem: ověřit odpověď (HTTP, formát), přidat do `source-config.ts`, průběh zkontrolovat v konzoli dev serveru (viz specifikace §8).  
- Tento dokument udržovat při přidání zdroje nebo změně URL/API.
- Pro cíl **max. pokrytí dopravních zadavatelů** (včetně řízení mimo „čistě dopravní“ kategorie u téže organizace) používat pracovní mřížku **`.cursor/mrizka_dopravnich_zadavatelu_CZ.md`** a specifikaci **§1.2.1**.
- **Automatické ověření URL (bez prohlížeče):** z kořene repa `npm run probe-zdroje` — čte `apps/web/scripts/probe-zdroje-candidates.json`, vypíše TSV (HTTP, počet `contract_display_*`, příp. platnost NEN XML). Vlastní seznam: `npm run probe-zdroje -- cesta/k/souboru.json`.

### 7.1 Doporučený postup k plnému pokrytí zdrojů (roadmap)

1. Uzavřít zbývající gapy v mřížce zadavatelů (prioritně neověřené profily s vysokým dopadem).
2. Rozšířit NKOD o další městské/rezortní datasety jen tam, kde přinášejí detailní záznamy zakázek.
3. U komerčních agregátorů držet režim: **JOSEPHINE aktivní**, `NajdiVZ` a `Gemin` jako pilot/backlog podle metrik dostupnosti a unikátnosti.
4. Pilotní metriky držet ve statistikách běhu: `downloadedCount`, `extractedCount`, `classifiedRatio`, `uniqueVsExistingCount`, `duplicateVsExistingCount`, `dedupeByUrlCount`, `dedupeByFallbackCount`, `stability.errorCode`.
5. Rozhodnutí pilotních zdrojů potvrzovat na sérii běhů (min. 3; ideálně 5+) a evidovat trend GO/NO-GO.
6. Založit pravidla kvality zdrojů: minimální `rowCount`, aktuálnost `latestYear`, a varování při regresi.
7. Každý nově přidaný zdroj potvrdit 2krokově: technický probe + reálný ingest přes `/api/refresh` nebo `npm run ingest` (viz `.cursor/WORKFLOW_UI_PO_INGESTU.md`).

### 7.2 Chybějící relevantní zadavatelé (stav k 2026-04)

| Kandidát | Důvod | Postup ověření | Stav |
|---|---|---|---|
| SFDI | Strategický dopravní zadavatel; zatím bez dedikovaného profilového konektoru. | Probe známých profilových URL/slugů + dohledání oficiálního profilu; po pozitivním výsledku doplnit do `source-config.ts`. | K ověření |
| SŽ (alternativní XML profil) | Aktivní E‑ZAK existuje, ale chybí ověřený profilový XML fallback. | Pravidelně re-testovat kandidátní NEN/TenderArena slugy. | K ověření |
| DP subjekty bez vlastního profilu (dle mřížky) | Potenciální mezery, pokud zůstávají jen přes centrální agregáty. | Kandidát → URL test (`npm run probe-zdroje`) → rozhodnutí Aktivně/K ověření/Backlog. | Backlog |

---

### 7.3 Alternativní zdroje (stav k 2026-04)

| Zdroj | Typ | Stav | Poznámky |
|---|---|---|---|
| **Hlídač státu API** (`api.hlidacstatu.cz`) | REST API v2 | **Implementováno** | Konektor `hlidac-statu_fetcher.ts`. Endpoint `GET /api/v2/verejnezakazky/hledat` s filtrem `icozadavatel:{ICO}`. Token v `HLIDAC_STATU_API_TOKEN` — bez tokenu se přeskočí. Licence CC BY 3.0. Seznam `HLIDAC_STATU_PROCURERS` v [`source-config.ts`](apps/web/src/lib/ingestion/source-config.ts): cca **34** IČO — resort dopravy (vč. ČEPS), HMP, **všech 13 krajských úřadů**, vybraná statutární města a dopravní podniky dle mřížky zadavatelů. Očekávejte delší běh ingestu a částečnou duplicitu vůči primárním E‑ZAK/TenderArena/NEN kanálům. |
| **NEN veřejné API** (`nen-ws.nipez.cz/PS01r`) | REST API | **Nevhodné** | Transakční/integrační API (podávání nabídek, e-katalogy), nikoli datový export. Vyžaduje identitu NIPEZ. Neobsahuje listing zakázek. Rozhodnutí: **neintegrovat**. |

### 7.4 Optimalizace rychlosti ingestu (2026-04)

Implementované změny v `apps/web/src/lib/ingestion/`:

- **Host-aware paralelizace** (`fetcher.ts`): generické XML profily se seskupují dle host domény, skupiny různých hostů běží souběžně.
- **429 circuit breaker** (`fetcher.ts`): po N po sobě jdoucích HTTP 429 na stejném hostu se zbylé zdroje přeskočí (`INGEST_HOST_429_CONSECUTIVE_THRESHOLD`, výchozí 2).
- **Přeskakování enrichmentu** (`fetcher.ts`, `ingest-to-db.ts`): záznamy s existujícím deadline v DB nejsou znovu stahovány z HTML detailu.
- **NEN timeout** (`fetcher.ts`): snížení výchozího timeoutu z 30 s na 20 s, abort backoff z 1,5 s na 0,8 s, max timeout z 60 s na 40 s.
- **NEN auto-disable** (`ingest-to-db.ts`): profily, které selhaly (timeout/abort) v posledních 3 úspěšných bězích, jsou dočasně přeskočeny.
- **Paralelní NEN + generické profily** (`fetcher.ts`): NEN slugy a generické XML profily běží souběžně přes `Promise.all`.
- **Proxy pilot** (`proxy-setup.ts`): runtime inicializace `undici ProxyAgent` z `INGEST_PROXY_URL`.

---

## 8. Reference (neúplný seznam odkazů)

- NEN veřejné zakázky: `https://nen.nipez.cz/verejne-zakazky`  
- Podpora NIPEZ (import/export profilu): `https://podpora.nipez.cz/cs/nen/latest/import-profilu`  
- RVZ — pravidla: `https://podpora.nipez.cz/cs/pravidla-pouziti-registru-verejnych-zakazek/latest`  
- Portál VZ — RVZ: `https://www.portal-vz.cz/nipez/registr-verejnych-zakazek/`  
- VVZ RSS: `https://vvz.nipez.cz/rss/zakazky.xml`  
- NKOD: `https://data.gov.cz/`  
- E‑ZAK producent — zadavatelé: `https://ezak.cz/zadavatele`  

*(Swagger NEN WS se v terénu často ověřuje přímo v prohlížeči / u provozovatele; dynamické rozhraní může vyžadovat jiný base path.)*
