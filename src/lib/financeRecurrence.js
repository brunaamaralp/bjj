/** Helpers de recorrência de lançamentos (UI). */

export const RECURRENCE_TYPES = {
  NONE: 'none',
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
};

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Próximos 24 meses para select "Até". */
export function buildRecurrenceEndOptions() {
  const out = [{ value: '', label: 'Sem data fim (indefinido)' }];
  const d = new Date();
  for (let i = 0; i < 24; i += 1) {
    const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const ym = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
    try {
      const label = x.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      out.push({ value: ym, label });
    } catch {
      out.push({ value: ym, label: ym });
    }
  }
  return out;
}

export function isRecurrenceTx(tx) {
  if (!tx) return false;
  return tx.is_recurrence_template === true || String(tx.recurrence_origin_id || '').trim() !== '';
}

export function recurrenceTooltip(tx) {
  if (tx?.is_recurrence_template) return 'Modelo de lançamento recorrente';
  if (tx?.recurrence_origin_id) return 'Lançamento recorrente — gerado automaticamente';
  return '';
}

export function defaultRecurrenceForm() {
  return {
    repeat_enabled: false,
    recurrence_type: RECURRENCE_TYPES.MONTHLY,
    recurrence_day: 1,
    recurrence_end: '',
  };
}

export function normalizeRecurrenceDay(type, day) {
  const t = String(type || RECURRENCE_TYPES.MONTHLY);
  const n = Math.trunc(Number(day) || 1);
  if (t === RECURRENCE_TYPES.WEEKLY) {
    return Math.min(6, Math.max(0, n));
  }
  return Math.min(28, Math.max(1, n));
}
