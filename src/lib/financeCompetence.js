/**
 * Competência (YYYY-MM) e regime de visualização (caixa vs competência).
 */

export const FINANCE_REGIME = {
  CASH: 'cash',
  COMPETENCE: 'competence',
};

const LS_PREFIX = 'navi_finance_regime_';

export function competenceMonthFromIso(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 7);
}

export function currentCompetenceMonth() {
  return competenceMonthFromIso(new Date());
}

export function parseCompetenceMonth(ym) {
  const s = String(ym || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

/** Mês de competência efetivo (fallback = mês do pagamento). */
export function effectiveCompetenceMonth(tx) {
  const explicit = parseCompetenceMonth(tx?.competence_month);
  if (explicit) return explicit;
  return competenceMonthFromIso(tx?.settledAt || tx?.createdAt || tx?.$createdAt);
}

export function competenceMonthMissing(tx) {
  return !parseCompetenceMonth(tx?.competence_month);
}

export function getFinanceRegime(academyId, options = {}) {
  if (options.forceCash || options.actorRole === 'receptionist') return FINANCE_REGIME.CASH;
  if (!academyId || typeof localStorage === 'undefined') return FINANCE_REGIME.CASH;
  try {
    const v = localStorage.getItem(`${LS_PREFIX}${academyId}`);
    return v === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;
  } catch {
    return FINANCE_REGIME.CASH;
  }
}

export function setFinanceRegime(academyId, regime, options = {}) {
  if (options.actorRole === 'receptionist') return;
  if (!academyId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `${LS_PREFIX}${academyId}`,
      regime === FINANCE_REGIME.COMPETENCE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH
    );
  } catch {
    void 0;
  }
}

export function financeRegimeLabel(regime) {
  return regime === FINANCE_REGIME.COMPETENCE ? 'Competência' : 'Caixa';
}

/** Lista YYYY-MM entre datas inclusivas (from/to = YYYY-MM-DD). */
export function competenceMonthsInRange(from, to) {
  const start = String(from || '').slice(0, 7);
  const end = String(to || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) {
    if (/^\d{4}-\d{2}$/.test(start)) return [start];
    return [];
  }
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  let guard = 0;
  while (guard++ < 120) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push(ym);
    if (y === y2 && m === m2) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function startOfDayIso(ymd) {
  if (!ymd) return null;
  return new Date(`${ymd}T00:00:00`).getTime();
}

function endOfDayIso(ymd) {
  if (!ymd) return null;
  return new Date(`${ymd}T23:59:59.999`).getTime();
}

export function txTemporalIso(tx) {
  const st = String(tx?.status || '').toLowerCase();
  if (st === 'settled') return tx?.settledAt || tx?.createdAt || tx?.$createdAt || '';
  return tx?.createdAt || tx?.$createdAt || '';
}

export function txInPeriod(tx, { from = '', to = '', regime = FINANCE_REGIME.CASH } = {}) {
  const st = String(tx?.status || '').toLowerCase();
  if (st === 'cancelled') return false;

  if (regime === FINANCE_REGIME.COMPETENCE) {
    const ym = effectiveCompetenceMonth(tx);
    const months = competenceMonthsInRange(from, to);
    if (months.length === 0) return true;
    return months.includes(ym);
  }

  const iso = txTemporalIso(tx);
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const fromMs = startOfDayIso(from);
  const toMs = endOfDayIso(to);
  if (fromMs != null && t < fromMs) return false;
  if (toMs != null && t > toMs) return false;
  return true;
}
