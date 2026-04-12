/**
 * Appwrite attribute human_handoff_until: string, max 20 chars.
 * Store Unix ms as digits (e.g. "1712188800000") — fits schema and sorts lexicographically by time.
 */

export function humanHandoffUntilToMs(raw) {
  const s = raw != null ? String(raw).trim() : '';
  if (!s) return 0;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    // Só dígitos: ms típicos (2020+) têm ≥13 caracteres / ≥1e12; Unix em segundos fica abaixo disso.
    if (n > 0 && n < 1e12) return n * 1000;
    return n;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function humanHandoffUntilFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const out = String(Math.round(ms));
  return out.length > 20 ? out.slice(0, 20) : out;
}

export function humanHandoffIsActive(raw) {
  const ms = humanHandoffUntilToMs(raw);
  return ms > Date.now();
}
