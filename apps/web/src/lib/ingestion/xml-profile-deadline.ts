/**
 * Vyhláška 345/2023 — profil zadavatele XML (`urn:cz:isvz:mmr:schemas:vz-z-profilu-zadavatele:v100`).
 * Lhůta podání nabídky: `zadavaci_postup_casti` → `lhuty_zadavaciho_postupu` → `lhuta` kde
 * `druh_lhuty` = „lhůta podání nabídky“ a `datum_konce_lhuty` je ISO bez časové zóny (předpoklad místního času CZ).
 */

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{M}/gu, "");
}

function isNabidkaLhutaDruh(druhRaw: string): boolean {
  const n = stripDiacritics(druhRaw).toLowerCase();
  /** „nabídek“, „nabídky“, „nabídka“ → společný řetězec `nabid…` (ne jen `nabidky`). */
  return n.includes("podani") && n.includes("nabid");
}

/** Žádost o účast / doručení žádosti — fallback, pokud v XML chybí lhůta nabídky. */
function isZadostOUcastLhutaDruh(druhRaw: string): boolean {
  const n = stripDiacritics(druhRaw).toLowerCase();
  if (n.includes("nabid")) return false;
  return (
    n.includes("zadost") &&
    (n.includes("ucast") || n.includes("podani") || n.includes("dorucen"))
  );
}

function firstScalar(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length > 0) {
    const v = value[0];
    if (typeof v === "string") return v;
  }
  if (typeof value === "string") return value;
  return null;
}

/**
 * @param zpc — první prvek `zadavaci_postup_casti` z xml2js (stejně jako v `fetcher.ts`)
 */
export function extractSubmissionDeadlineFromZpc(zpc: unknown): Date | null {
  if (!zpc || typeof zpc !== "object") return null;
  const z = zpc as Record<string, unknown>;

  const lhutyArr = z.lhuty_zadavaciho_postupu;
  const lhutyBlocks: unknown[] = Array.isArray(lhutyArr)
    ? lhutyArr
    : lhutyArr != null
      ? [lhutyArr]
      : [];
  if (lhutyBlocks.length === 0) return null;

  const lhutaList: unknown[] = [];
  for (const block of lhutyBlocks) {
    if (!block || typeof block !== "object") continue;
    const lhutaRaw = (block as Record<string, unknown>).lhuta;
    if (Array.isArray(lhutaRaw)) lhutaList.push(...lhutaRaw);
    else if (lhutaRaw != null) lhutaList.push(lhutaRaw);
  }
  if (lhutaList.length === 0) return null;

  for (const lh of lhutaList) {
    if (!lh || typeof lh !== "object") continue;
    const rec = lh as Record<string, unknown>;
    const druh = firstScalar(rec.druh_lhuty);
    if (!druh || !isNabidkaLhutaDruh(druh)) continue;
    const rawEnd = firstScalar(rec.datum_konce_lhuty);
    if (!rawEnd) continue;
    const d = new Date(rawEnd);
    if (!isNaN(d.getTime())) return d;
  }

  let zadostBest: Date | null = null;
  for (const lh of lhutaList) {
    if (!lh || typeof lh !== "object") continue;
    const rec = lh as Record<string, unknown>;
    const druh = firstScalar(rec.druh_lhuty);
    if (!druh || !isZadostOUcastLhutaDruh(druh)) continue;
    const rawEnd = firstScalar(rec.datum_konce_lhuty);
    if (!rawEnd) continue;
    const d = new Date(rawEnd);
    if (isNaN(d.getTime())) continue;
    if (!zadostBest || d.getTime() < zadostBest.getTime()) zadostBest = d;
  }

  return zadostBest;
}
