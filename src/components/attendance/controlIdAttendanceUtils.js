import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const DATE_RANGES = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'all', label: 'Todos' },
];

export function rangeToIso(rangeId) {
  const now = new Date();
  if (rangeId === 'today') return { start: startOfDay(now).toISOString(), end: null };
  if (rangeId === '7d') return { start: subDays(now, 7).toISOString(), end: null };
  if (rangeId === '30d') return { start: subDays(now, 30).toISOString(), end: null };
  return { start: null, end: null };
}

export function formatDateTime(iso) {
  try {
    return format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso || '—';
  }
}

export function formatTime(iso) {
  try {
    return format(parseISO(iso), 'HH:mm', { locale: ptBR });
  } catch {
    return '—';
  }
}

export function formatDateLabel(iso) {
  try {
    return format(parseISO(iso), "EEEE, dd 'de' MMMM", { locale: ptBR });
  } catch {
    return '';
  }
}

export function avatarInitial(name) {
  return String(name || '?')[0].toUpperCase();
}

export function groupByDate(records) {
  const groups = [];
  let currentDate = null;
  for (const rec of records) {
    const dateKey = String(rec.checked_in_at || '').slice(0, 10);
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      groups.push({ date: dateKey, label: formatDateLabel(rec.checked_in_at), records: [] });
    }
    groups[groups.length - 1].records.push(rec);
  }
  return groups;
}

export function todayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
