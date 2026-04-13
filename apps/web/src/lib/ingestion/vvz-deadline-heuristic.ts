/**
 * Slabý signál z RSS/Atom popisu — použít jen pokud regex najde souvislost s lhůtou/podáním.
 */
export function tryDeadlineFromVvzPlainText(text: string): Date | null {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return null;

  const re =
    /(?:lh[uů]ta|pod[aá]n[ií](?:\s+pro)?\s+n[aá]b[ií]d(?:ku|ky|ek|ce))[\s\S]{0,200}?(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i;
  const m = re.exec(plain);
  if (!m) return null;

  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const y = m[3];
  if (m[4] != null && m[5] != null) {
    const h = m[4].padStart(2, "0");
    const min = m[5].padStart(2, "0");
    const dt = new Date(`${y}-${mo}-${d}T${h}:${min}:00`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return isNaN(dt.getTime()) ? null : dt;
}
