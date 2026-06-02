/** Intervalo imediatamente anterior ao selecionado (mesma lógica de /api/reports). */

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseYMD = (s) => {
  if (!s) return null;
  const [Y, M, D] = s.split('-').map(Number);
  return new Date(Y, (M || 1) - 1, D || 1);
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/**
 * @param {'today'|'week'|'month'|'last_month'|'custom'} preset
 * @param {{ from: string, to: string }} range
 * @returns {{ from: string, to: string }}
 */
export function previousPeriodRange(preset, range) {
  const fromDay = parseYMD(range.from);
  const toDay = parseYMD(range.to);
  const toDEndLocal = new Date(toDay);
  toDEndLocal.setHours(23, 59, 59, 999);

  const prevFromDLocal = (() => {
    if (preset === 'today') {
      const d = new Date(fromDay);
      d.setDate(d.getDate() - 1);
      return d;
    }
    if (preset === 'week') {
      const d = new Date(fromDay);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (preset === 'month' || preset === 'last_month') {
      const d = new Date(fromDay.getFullYear(), fromDay.getMonth() - 1, 1);
      return startOfMonth(d);
    }
    const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
    const d = new Date(fromDay);
    d.setDate(d.getDate() - span);
    return d;
  })();

  const prevToDLocal = (() => {
    if (preset === 'today') {
      const d = new Date(toDEndLocal);
      d.setDate(d.getDate() - 1);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    if (preset === 'week') {
      const d = new Date(toDEndLocal);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (preset === 'month' || preset === 'last_month') {
      return endOfMonth(new Date(prevFromDLocal));
    }
    const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
    const d = new Date(toDEndLocal);
    d.setDate(d.getDate() - span);
    return d;
  })();

  return { from: ymd(prevFromDLocal), to: ymd(prevToDLocal) };
}

/** Últimos N meses civis terminando no mês de `anchorYmd` (inclusivo). */
export function lastNMonthRanges(anchorYmd, count = 6) {
  const anchor = parseYMD(anchorYmd) || new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const from = startOfMonth(d);
    const to = endOfMonth(d);
    const label = from.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\./g, '');
    out.push({
      from: ymd(from),
      to: ymd(to),
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
  }
  return out;
}
