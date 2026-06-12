export const REPORT_PRESETS = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês anterior' },
  { key: 'custom', label: 'Personalizado' },
];

export const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

export const parseYMD = (s) => {
  if (!s) return null;
  const [Y, M, D] = s.split('-').map(Number);
  return new Date(Y, (M || 1) - 1, D || 1);
};

export function resolveReportsRange(preset, customFrom, customTo) {
  const now = new Date();
  if (preset === 'today') return { from: ymd(now), to: ymd(now) };
  if (preset === 'week') return { from: ymd(startOfWeek(now)), to: ymd(endOfWeek(now)) };
  if (preset === 'month') return { from: ymd(startOfMonth(now)), to: ymd(endOfMonth(now)) };
  if (preset === 'last_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)) };
  }
  return { from: customFrom, to: customTo };
}

const formatLongPtDate = (dateInput) => {
  const d = typeof dateInput === 'string' ? parseYMD(dateInput) : dateInput;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export function formatRangeLongPt(fromInput, toInput) {
  const fromLabel = formatLongPtDate(fromInput);
  const toDate = typeof toInput === 'string' ? parseYMD(toInput) : toInput;
  if (!fromLabel || !(toDate instanceof Date) || Number.isNaN(toDate.getTime())) return `${fromInput} — ${toInput}`;
  const toDayMonth = toDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  const toYear = toDate.getFullYear();
  return `${fromLabel} — ${toDayMonth} de ${toYear}`;
}
