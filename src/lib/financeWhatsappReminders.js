/**
 * Lembretes de mensalidade via WhatsApp (Zapster) — config e templates.
 */

export const FINANCE_REMINDER_PLACEHOLDERS = [
  { key: '{{nome}}', label: 'Nome do aluno' },
  { key: '{{valor}}', label: 'Valor da mensalidade' },
  { key: '{{vencimento}}', label: 'Data de vencimento' },
  { key: '{{plano}}', label: 'Plano' },
  { key: '{{academia}}', label: 'Nome da academia' },
];

export const DEFAULT_WHATSAPP_REMINDER_MESSAGES = {
  dueSoon:
    'Olá, {{nome}}! 👋 Sua mensalidade de {{valor}} vence em {{vencimento}}. Qualquer dúvida, é só falar com a gente!',
  overdue:
    'Olá, {{nome}}! Identificamos que sua mensalidade de {{valor}} está em aberto. Entre em contato para regularizar. 🙏',
};

export function defaultWhatsappRemindersConfig() {
  return {
    dueSoon: {
      enabled: false,
      daysBefore: 3,
      message: DEFAULT_WHATSAPP_REMINDER_MESSAGES.dueSoon,
    },
    overdue: {
      enabled: false,
      daysAfter: 3,
      message: DEFAULT_WHATSAPP_REMINDER_MESSAGES.overdue,
    },
  };
}

function clampInt(n, min, max, fallback) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function normalizeWhatsappRemindersConfig(raw) {
  const base = defaultWhatsappRemindersConfig();
  if (!raw || typeof raw !== 'object') return base;
  return {
    dueSoon: {
      enabled: Boolean(raw.dueSoon?.enabled),
      daysBefore: clampInt(raw.dueSoon?.daysBefore, 1, 7, base.dueSoon.daysBefore),
      message: String(raw.dueSoon?.message || base.dueSoon.message).trim() || base.dueSoon.message,
    },
    overdue: {
      enabled: Boolean(raw.overdue?.enabled),
      daysAfter: clampInt(raw.overdue?.daysAfter, 1, 7, base.overdue.daysAfter),
      message: String(raw.overdue?.message || base.overdue.message).trim() || base.overdue.message,
    },
  };
}

export function mergeWhatsappRemindersIntoFinanceConfig(financeConfig) {
  const cfg = financeConfig && typeof financeConfig === 'object' ? { ...financeConfig } : {};
  cfg.whatsappReminders = normalizeWhatsappRemindersConfig(cfg.whatsappReminders);
  return cfg;
}

export function digestWhatsappReminders(reminders) {
  return JSON.stringify(normalizeWhatsappRemindersConfig(reminders));
}

export function formatReminderCurrencyBrl(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatReminderDatePt(ymdOrIso) {
  const key = String(ymdOrIso || '').slice(0, 10);
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * @param {string} template
 * @param {{ nome?: string, valor?: string, vencimento?: string, plano?: string, academia?: string }} vars
 */
export function applyFinanceReminderPlaceholders(template, vars) {
  return String(template || '')
    .replace(/\{\{nome\}\}/g, vars.nome ?? '')
    .replace(/\{\{valor\}\}/g, vars.valor ?? '')
    .replace(/\{\{vencimento\}\}/g, vars.vencimento ?? '')
    .replace(/\{\{plano\}\}/g, vars.plano ?? '')
    .replace(/\{\{academia\}\}/g, vars.academia ?? '');
}

export function paymentDueDateKey(payment) {
  if (payment?.due_date) return String(payment.due_date).slice(0, 10);
  const ref = String(payment?.reference_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) return `${ref}-01`;
  return null;
}

export function addDaysToYmd(ymd, days) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayYmdUtc() {
  return new Date().toISOString().slice(0, 10);
}

const REMINDER_ELIGIBLE_STATUSES = new Set(['pending', 'awaiting']);

export function isPaymentEligibleForWhatsappReminder(payment) {
  const st = String(payment?.status || '').toLowerCase();
  return REMINDER_ELIGIBLE_STATUSES.has(st);
}

export function whatsappRemindersActive(cfg) {
  const w = normalizeWhatsappRemindersConfig(cfg?.whatsappReminders);
  return w.dueSoon.enabled || w.overdue.enabled;
}
