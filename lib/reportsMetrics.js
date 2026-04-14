/** Lógica pura compartilhada entre api/reports.js e testes. */

export const startOfWeek = (d) => {
  const dd = new Date(d);
  const day = dd.getDay();
  const diff = (day + 6) % 7;
  dd.setDate(dd.getDate() - diff);
  dd.setHours(0, 0, 0, 0);
  return dd;
};

export const endOfWeek = (d) => {
  const dd = startOfWeek(d);
  dd.setDate(dd.getDate() + 6);
  dd.setHours(23, 59, 59, 999);
  return dd;
};

export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

export function buildWeekBuckets(fromRaw, toRaw) {
  const fromD = new Date(fromRaw);
  const toDEnd = new Date(toRaw);

  const out = [];
  let s = startOfWeek(new Date(fromD));
  let guard = 0;
  const toMs = toDEnd.getTime();
  while (s.getTime() <= toMs && guard++ < 60) {
    const e = endOfWeek(s);
    const clipEndMs = Math.min(e.getTime(), toMs);
    const clipEnd = new Date(clipEndMs);
    out.push({
      start: new Date(s),
      end: clipEnd,
      label: `${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}`,
      newLeads: 0,
      scheduled: 0,
      converted: 0
    });
    const next = new Date(e);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    s = startOfWeek(next);
  }
  return out;
}

export function buildMonthBuckets(fromRaw, toRaw) {
  const fromD = new Date(fromRaw);
  const toDEnd = new Date(toRaw);

  const out = [];
  let s = startOfMonth(new Date(fromD));
  let guard = 0;
  const toMs = toDEnd.getTime();
  while (s.getTime() <= toMs && guard++ < 36) {
    const e = endOfMonth(s);
    const clipEndMs = Math.min(e.getTime(), toMs);
    const clipEnd = new Date(clipEndMs);
    out.push({
      start: new Date(s),
      end: clipEnd,
      label: `${String(s.getMonth() + 1).padStart(2, '0')}/${String(s.getFullYear()).slice(-2)}`,
      newLeads: 0,
      scheduled: 0,
      converted: 0
    });
    s = startOfMonth(new Date(s.getFullYear(), s.getMonth() + 1, 1));
  }
  return out;
}

export function isRealLead(l) {
  return l.origin !== 'Planilha';
}

export function inRange(ts, fromTs, toTs) {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return t >= new Date(fromTs).getTime() && t <= new Date(toTs).getTime();
}

export function inRangeYmd(ymd, fromTs, toTs) {
  if (!ymd) return false;
  const [Y, M, D] = String(ymd).split('-').map(Number);
  const t = new Date(Y, (M || 1) - 1, D || 1).getTime();
  return t >= new Date(fromTs).getTime() && t <= new Date(toTs).getTime();
}

export function countsAsConvertedInPeriod(l, fromTs, toTs) {
  if (!isRealLead(l)) return false;
  if (l.converted_at && inRange(l.converted_at, fromTs, toTs)) return true;
  return l.contact_type === 'student' && inRange(l.$updatedAt, fromTs, toTs);
}
