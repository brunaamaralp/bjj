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

/** Novos alunos: somente converted_at no período (sem fallback $updatedAt). */
export function countsAsNewStudentInPeriod(l, fromTs, toTs) {
  if (!isRealLead(l)) return false;
  return Boolean(l.converted_at && inRange(l.converted_at, fromTs, toTs));
}

/** @deprecated Use countsAsNewStudentInPeriod */
export function countsAsConvertedInPeriod(l, fromTs, toTs) {
  return countsAsNewStudentInPeriod(l, fromTs, toTs);
}

function parseYmdToDate(ymd) {
  if (!ymd) return null;
  const [Y, M, D] = String(ymd).split('-').map(Number);
  const dt = new Date(Y, (M || 1) - 1, D || 1, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Aluno ativo na data de referência (início do período). */
export function isActiveStudentAtDate(l, atDate) {
  const convertedAt = l.converted_at ? new Date(l.converted_at) : null;
  if (!convertedAt || Number.isNaN(convertedAt.getTime())) return false;
  if (convertedAt.getTime() >= atDate.getTime()) return false;

  const exitYmd = String(l.exit_date || l.exitDate || '').trim().slice(0, 10);
  if (!exitYmd) return true;
  const exitDt = parseYmdToDate(exitYmd);
  if (!exitDt) return true;
  return exitDt.getTime() >= atDate.getTime();
}

export function countsAsDeactivationInPeriod(l, fromTs, toTs) {
  const exitYmd = String(l.exit_date || l.exitDate || '').trim().slice(0, 10);
  if (!exitYmd) return false;
  const [Y, M, D] = exitYmd.split('-').map(Number);
  const exitIso = new Date(Y, (M || 1) - 1, D || 1, 12, 0, 0, 0).toISOString();
  return inRange(exitIso, fromTs, toTs);
}

/**
 * "Não compareceu" para aula experimental:
 * - Regra principal: evento explícito em missed_at no período.
 * - Fallback legado: status MISSED + data da aula no período.
 */
export function countsAsMissedExperimentalInPeriod(l, fromTs, toTs) {
  if (!isRealLead(l)) return false;
  if (l.missed_at && inRange(l.missed_at, fromTs, toTs)) return true;
  const s = String(l.status || '').trim().toLowerCase();
  const isMissedStatus = s === 'missed' || s === 'não compareceu' || s === 'nao compareceu';
  return isMissedStatus && inRangeYmd(l.scheduledDate, fromTs, toTs);
}
