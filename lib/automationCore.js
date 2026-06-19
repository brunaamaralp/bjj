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
  absent_student: { active: false, templateKey: 'recovery', thresholdDays: 10 },
  newcomer_at_risk: { active: false, templateKey: 'recovery', thresholdDays: 7 },
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
      .map((x) => {
        const entry = {
          key: String(x.key || '').trim(),
          sendAt: String(x.sendAt || '').trim(),
          sent: x.sent === true,
        };
        const sentAt = String(x.sentAt || '').trim();
        if (sentAt) entry.sentAt = sentAt;
        return entry;
      })
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

/**
 * Mescla fila local (UI) com estado remoto (Appwrite) antes de gravar.
 * @param {Array<{ key: string; sendAt: string; sent?: boolean }>} local
 * @param {Array<{ key: string; sendAt: string; sent?: boolean }>} remote
 * @returns {Array<{ key: string; sendAt: string; sent: boolean }>}
 */
export function mergePendingAutomations(local, remote) {
  const remoteSentKeys = new Set(
    (Array.isArray(remote) ? remote : [])
      .filter((item) => item?.key && item.sent === true)
      .map((item) => String(item.key).trim())
  );

  const localByKey = new Map();
  for (const item of Array.isArray(local) ? local : []) {
    const key = String(item?.key || '').trim();
    const sendAt = String(item?.sendAt || '').trim();
    if (!key || !sendAt) continue;
    localByKey.set(key, {
      key,
      sendAt,
      sent: remoteSentKeys.has(key) ? true : item.sent === true,
    });
  }

  return [...localByKey.values()];
}

/** Janela para não reenviar se o write pós-envio falhou (ms). */
export const PENDING_AUTOMATION_RESEND_GUARD_MS = 30 * 60 * 1000;

/**
 * Item com `sentAt` recente já teve envio; pular reenvio se o persist de sent:true falhou.
 * @param {{ sent?: boolean; sentAt?: string }} item
 * @param {number} [nowMs]
 */
export function shouldSkipPendingAutomationResend(item, nowMs = Date.now()) {
  const sentAt = String(item?.sentAt || '').trim();
  if (!sentAt) return false;
  const sentAtMs = new Date(sentAt).getTime();
  if (!Number.isFinite(sentAtMs)) return false;
  return nowMs - sentAtMs < PENDING_AUTOMATION_RESEND_GUARD_MS;
}

/**
 * @param {{ key: string; sendAt: string; sent?: boolean; sentAt?: string }} item
 * @param {string} [sentAtIso]
 */
export function markPendingAutomationSent(item, sentAtIso = new Date().toISOString()) {
  return {
    ...item,
    sent: true,
    sentAt: sentAtIso,
  };
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
