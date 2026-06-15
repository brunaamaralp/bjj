/**
 * Lógica compartilhada de automações WhatsApp (cliente + cron).
 */

export const AUTOMATION_DEFAULTS = {
  schedule_confirm: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  presence_confirmed: { active: false, templateKey: 'post_class', delayMinutes: 0 },
  missed: { active: false, templateKey: 'missed', delayMinutes: 0 },
  waiting_decision: { active: false, templateKey: 'recovery', delayMinutes: 1440 },
  followup_d1_attended: { active: false, templateKey: 'dashboard_contact', delayMinutes: 0 },
  converted: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  schedule_reminder: { active: false, templateKey: 'reminder', delayMinutes: 120 },
  birthday: { active: false, templateKey: 'birthday', delayMinutes: 0 },
};

/** Modelo sugerido por gatilho (valor padrão em `templateKey`). */
export function recommendedTemplateKeyForAutomation(automationKey) {
  return String(AUTOMATION_DEFAULTS[automationKey]?.templateKey || '').trim();
}

export function parseAutomationsConfig(raw) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
    return Object.fromEntries(
      Object.entries(AUTOMATION_DEFAULTS).map(([key, defaults]) => [
        key,
        { ...defaults, ...(saved[key] ?? {}) },
      ])
    );
  } catch {
    return Object.fromEntries(
      Object.entries(AUTOMATION_DEFAULTS).map(([key, defaults]) => [key, { ...defaults }])
    );
  }
}

export function parsePendingAutomations(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        key: String(x.key || '').trim(),
        sendAt: String(x.sendAt || '').trim(),
        sent: x.sent === true,
      }))
      .filter((x) => x.key && x.sendAt);
  } catch {
    return [];
  }
}

/** @param {Array<{ key: string; sendAt: string; sent?: boolean }>} existing */
export function upsertPendingEntry(existing, key, sendAtIso) {
  const list = Array.isArray(existing) ? existing : [];
  const kept = list.filter((item) => !(item?.key === key && item?.sent === false));
  return [...kept, { key, sendAt: sendAtIso, sent: false }];
}

export function buildPendingLeadPatch(lead, key, sendAtIso) {
  const next = upsertPendingEntry(lead?.pendingAutomations, key, sendAtIso);
  return { pendingAutomations: next, hasPendingAutomations: true };
}

/** Lembrete: delayMinutes antes da aula (horário local do navegador / ambiente). */
export function buildReminderSendAtIso(ymd, hhmm, delayMinutes) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-').map(Number);
  const [h, mi] = String(hhmm || '').split(':').map(Number);
  const date = new Date(
    y || 1970,
    (m || 1) - 1,
    d || 1,
    Number.isFinite(h) ? h : 0,
    Number.isFinite(mi) ? mi : 0,
    0,
    0
  );
  date.setMinutes(date.getMinutes() - (Number(delayMinutes) || 0));
  return date.toISOString();
}

export function buildWaitingDecisionSendAtIso(delayMinutes) {
  const delay = Number(delayMinutes) || 0;
  if (delay <= 0) return '';
  return new Date(Date.now() + delay * 60000).toISOString();
}

/** D+1 às 10h (horário local do browser de quem marcou presença)
 *  após a data da aula experimental. sendAt é calculado no cliente
 *  e persistido como ISO UTC na fila pending_automations. */
export function buildFollowupD1SendAtIso(scheduledDateYmd) {
  const ymd = String(scheduledDateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, 10, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function normalizePhoneDigits(v) {
  return String(v || '').replace(/\D/g, '');
}
