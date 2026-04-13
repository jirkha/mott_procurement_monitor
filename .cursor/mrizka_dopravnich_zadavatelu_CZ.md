# Mřížka dopravních zadavatelů (ČR) — systematické rozšiřování sběru

**Cíl:** Maximální pokrytí zakázek **dopravně relevantních zadavatelů** v ČR.

**Princip sběru:** Z profilu zadavatele bereme **celý výčet** řízení (ne jen „dopravní" CPV). Výběr relevance je v aplikaci (klasifikátor, nekategorizované, štítky). Viz specifikace §1.2.1.

**Provozní pravidlo pokrytí:** U klíčových zadavatelů udržovat vždy **primární zdroj + fallback** (typicky VVZ RSS nebo alternativní profil), aby byl sběr odolný při výpadku portálu.

**Klíčový objev:** Systém **TenderArena** nabízí veřejný XML export na `/profily/{slug}/XMLdataVZ` (standard dle vyhlášky č. 345/2023 Sb.) — identický formát jako NEN. Stačí znát slug profilu.

**Stavový model (sjednoceno s inventářem §1.1):**  
`Aktivně integrované` = aktivní v pipeline; `K ověření` = relevantní, ale bez finálního technického potvrzení; `Backlog` = evidováno pro pozdější rozšíření.

---

## 1. Stát — resort dopravy a síť

| Zadavatel | Zdroj | Typ | Stav |
|-----------|-------|-----|------|
| Ministerstvo dopravy | NEN `MDCR` | XML | **Aktivně integrované** |
| ŘSD | NEN `RSD` | XML | **Aktivně integrované** |
| Ředitelství vodních cest ČR | NEN `RVCCR` | XML | **Aktivně integrované** |
| Správa železnic | E-ZAK `zakazky.spravazeleznic.cz` | HTML scraping | **Aktivně integrované** |
| SFDI | VVZ RSS (centrální) | RSS | **K ověření** |
| České dráhy | TenderArena `CD` | XML | **Aktivně integrované** |
| Zlínský kraj (resort dopravy) | NEN `ZLK` | XML | **Aktivně integrované** |

---

## 2. Hlavní město Praha a MHD

| Zadavatel | Zdroj | Typ | Stav |
|-----------|-------|-----|------|
| HMP – Magistrát | TenderArena `HlavniMestoPraha` | XML | **Aktivně integrované** |
| OICT (operátor ICT) | NKOD CSV (Golemio) | CSV | **Aktivně integrované** |
| DPP Praha | TenderArena `DPP` | XML | **Aktivně integrované** |

---

## 3. Statutární města — MHD / velké DP

| Město / zadavatel | Primární zdroj | Fallback zdroj | Typ | Stav |
|-------------------|----------------|----------------|-----|------|
| Brno | E-ZAK `ezak.brno.cz` | VVZ RSS | HTML + RSS | **Aktivně integrované** |
| DPMB Brno | PROEBIZ `25508881` | VVZ RSS | XML + RSS | **Aktivně integrované** |
| Ostrava | TenderArena `Ostrava` | VVZ RSS | XML + RSS | **Aktivně integrované** |
| Ostrava-Jih (MO) | E-ZAK `zakazky.ovajih.cz` | VVZ RSS | HTML + RSS | **Aktivně integrované** |
| DPO Ostrava | PROEBIZ `61974757` | VVZ RSS | XML + RSS | **Aktivně integrované** |
| Plzeň / PMDP | E-ZAK `zakazky.pmdp.cz` | VVZ RSS | HTML + RSS | **Aktivně integrované** |
| Jihlava | E-ZAK `zakazky.jihlava.cz` | VVZ RSS | HTML + RSS | **Aktivně integrované** |
| Hradec Králové | TenderArena `hradeckralove` | VVZ RSS | XML + RSS | **Aktivně integrované** |
| DPMHK (DP města HK, a.s.) | *bez ověřeného samostatného profilu* | VVZ RSS | — | **Backlog** |
| Olomouc (město) | EVEZA `statutarni-mesto-olomouc` | VVZ RSS + Olomoucký kraj (eGORDION) | XML + RSS | **Aktivně integrované** |
| České Budějovice | eGORDION `profilgordionBudejovice` | VVZ RSS + Jihočeský kraj (TenderArena) | XML + RSS | **Aktivně integrované** |
| DPMO Olomouc | TenderArena `DPMOas` | VVZ RSS | XML + RSS | **Aktivně integrované** |
| DPMLJ Liberec/Jablonec | E-ZAK `contract_index_482` | VVZ RSS + Liberecký kraj (E-ZAK) | HTML + RSS | **Aktivně integrované** |
| DPMP Pardubice | TenderArena `DPMP` | VVZ RSS | XML + RSS | **Aktivně integrované** |
| DPMÚL Ústí nad Labem | TenderArena `DPMUL` | VVZ RSS + Ústí n. L. (E-ZAK) | XML + RSS | **Aktivně integrované** |
| DP Mladá Boleslav | TenderArena `DPMLB` | VVZ RSS | XML + RSS | **Aktivně integrované** |

---

## 4. Kraje

| Kraj | Zdroj | Stav |
|------|-------|------|
| Kraj Vysočina | E-ZAK `ezak.kr-vysocina.cz` | **Aktivně integrované** |
| Pardubický | E-ZAK `zakazky.pardubickykraj.cz` | **Aktivně integrované** |
| Středočeský | E-ZAK `zakazky.kr-stredocesky.cz` | **Aktivně integrované** |
| Liberecký | E-ZAK `zakazky.liberec.cz` | **Aktivně integrované** |
| Karlovarský | E-ZAK `ezak.kr-karlovarsky.cz` | **Aktivně integrované** |
| Jihomoravský | E-ZAK `zakazky.krajbezkorupce.cz` | **Aktivně integrované** |
| Plzeňský (CNPK) | E-ZAK `ezak.cnpk.cz` | **Aktivně integrované** |
| Moravskoslezský | E-ZAK `msk.ezak.cz` | **Aktivně integrované** |
| Královéhradecký | E-ZAK `zakazky.cenakhk.cz` | **Aktivně integrované** |
| Ústecký (město ÚnL) | E-ZAK `zakazky.usti-nad-labem.cz` | **Aktivně integrované** |
| Zlínský | NEN `ZLK` | **Aktivně integrované** |
| Jihočeský | TenderArena `JihoceskyKraj` | **Aktivně integrované** |
| Olomoucký | eGORDION XML | **Aktivně integrované** |

**Všech 13 krajů pokryto.**

---

## 5. Další zadavatelé (rozšíření)

| Zadavatel | Zdroj | Stav |
|-----------|-------|------|
| Úřad vlády | E-ZAK `zakazky.vlada.cz` | **Aktivně integrované** |
| MPSV | E-ZAK `mpsv.ezak.cz` | **Aktivně integrované** |
| Min. zemědělství | E-ZAK `zakazky.eagri.cz` | **Aktivně integrované** |
| Státní pozemkový úřad | E-ZAK `zakazky.spucr.cz` | **Aktivně integrované** |
| Krajská zdravotní (Ústecký kr.) | E-ZAK `zakazky.kzcr.eu` | **Aktivně integrované** |
| ČEPS | TenderArena `CEPS` | **Aktivně integrované** |

---

## 6. Celkový přehled zdrojů

| Typ zdroje | Počet | Příklady |
|------------|-------|----------|
| NEN XML profily | 4 | MDCR, RSD, RVCCR, ZLK |
| TenderArena XML profily | 11 | DPP, CD, HlavniMestoPraha, JihoceskyKraj, Ostrava, DPMOas, CEPS, hradeckralove, DPMP, DPMUL, DPMLB |
| PROEBIZ XML profil | 2 | DPO Ostrava, DPMB Brno |
| eGORDION XML profil | 2 | Olomoucký kraj, České Budějovice |
| EVEZA XML profil | 1 | Statutární město Olomouc |
| E-ZAK HTML scraping | 21 | Brno, DPMLJ, MSK, KHK, SŽ, ministerstva… *(bez MF — neaktuální profil, viz §5)* |
| VVZ RSS | 2 | Centrální kanály (nadlimitní + podlimitní) |
| NKOD CSV | 1 | OICT Praha |
| **Celkem** | **44** | |

**Ministerstvo financí:** profil `mfcr.ezak.cz` byl **2026-04 odstraněn z ingestu** (neaktuální / zastaralé údaje). Zakázky MF nepřibývají do monitoringu z tohoto kanálu.

Pozn.: MMR/NKOD celostátní XML sady „Zadané VZ podle typu/druhu“ jsou ověřené a běží jako samostatný analytický ingest (metriky ve statistikách běhu); v mřížce zadavatelů je proto neevidujeme jako samostatné primární profily.

---

## 7. Co zbývá

- [ ] **SŽ na TenderArena** *(K ověření)* — re-test 2026-04-09: kandidátní XML URL (`SpravaZeleznic`, `SpravaZeleznicniDopravniCesty`, `SZDC`) vrací `HTTP 500`/„Profil zadavatele nenalezen“; zůstává E‑ZAK + VVZ fallback.
- [ ] **Klasifikátor** — průběžně rozšiřovat klíčová slova (2026-04 doplněna *Veřejná doprava*: IDOS, příměstská doprava, integrovaný dopravní systém, nádraž, terminál, elektrobus aj.).
- [ ] **NIPEZ API** — vyžaduje registraci + certifikát; rozhodnutí: **nepřidáváme** (XML export z profilů je dostačující).
- [x] **DPMHK** *(Backlog)* — ověřeno: TenderArena `DPMHK` / odhadované slugy vracejí „Profil zadavatele nenalezen“; profil města HK je jiný zadavatel. Dedikovaný řádek v `source-config` záměrně chybí; pokrytí jako zadavatel přes **VVZ RSS** a kontext souvisejících profilů.

## 8. Prioritizované doplnění zdrojů

1. **Vysoká priorita** — DPMLJ je aktivně integrovaný; **DPMHK** uzavřen bez samostatného XML/E‑ZAK profilu (viz §7). Udržovat fallback přes VVZ RSS.
2. **Střední priorita** — komerční agregátory: **JOSEPHINE = GO** (produkční název); **NajdiVZ = NO-GO/backlog**; **Gemin = NO-GO** (volitelný konektor, doporučeno vypnout `INGEST_PILOT_DISABLE_GEMIN=1` v produkci).
3. **Nízká priorita** — další zdroje s vyšší bariérou; **Tenders.cz** dočasně backlog.
4. **TED / EU notices** — bez konektoru; zadat později rozsah a API.

## 9. Chybějící relevantní zadavatelé (operativní backlog)

| Kandidát | Důvod priority | Ověřovací krok | Stav |
|---|---|---|---|
| SFDI | Klíčový státní dopravní investor; zatím jen přes centrální VVZ. | Probe 2026-04-09 negativní (`NEN_PROFIL_NEEXISTUJE`, TenderArena `HTTP 500`, E‑ZAK odhad nedosažitelný). Pokračovat v periodickém ověřování a po pozitivním nálezu doplnit do `source-config.ts`. | **K ověření** |
| SŽ (alternativní XML kanál) | Primární E‑ZAK je aktivní, ale chybí druhý robustní profilový XML kanál. | Pravidelný re-test známých TenderArena/NEN slugů; při pozitivním nálezu doplnit jako fallback. | **K ověření** |
| Další DP bez dedikovaného profilu (po mřížce) | Riziko ztráty pokrytí jen přes agregáty. | Kandidát → URL probe → rozhodnutí Aktivně/K ověření/Backlog zapisovat do inventáře a následně do `source-config.ts`. | **Backlog** |

## 10. Synchronizace dokumentace

Při každém doplnění zdroje nebo změně URL musí být aktualizovány:

- `.cursor/specifikace_monitoringu_zakazek_CZ.md`,
- `.cursor/inventar_zdroju_verejnych_zakazek_CZ.md`,
- `.cursor/mrizka_dopravnich_zadavatelu_CZ.md`.

---

*Automatické ověření: `npm run probe-zdroje` (čte `apps/web/scripts/probe-zdroje-candidates.json`).*
