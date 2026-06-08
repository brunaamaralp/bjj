import {
  applyWhatsappTemplatePlaceholders,
  WHATSAPP_TEMPLATE_LABELS,
} from '../../lib/whatsappTemplateDefaults.js';
import { AUTOMATION_LABELS } from './useAutomations.js';

export const AUTOMATION_SKIP_REASONS = {
  inactive: 'Automação desativada nas configurações',
  delayed: 'Envio agendado (não imediato)',
  no_phone: 'Lead sem telefone',
  empty_template: 'Modelo de mensagem vazio',
  no_zapster: 'WhatsApp não conectado (Agente IA)',
  send_failed: 'Falha ao enviar',
};

/**
 * @typedef {{ status: 'sent'|'skipped'|'failed'; automationKey: string; reason?: string; channel?: string; scheduledAt?: string }} AutomationOutcome
 */

export function automationLabelForKey(key) {
  return AUTOMATION_LABELS[key]?.label || key;
}

export function formatSendAtShort(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `hoje ${time}`;
  if (isTomorrow) return `amanhã ${time}`;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getLeadAutomationBadges(lead, automationConfig) {
  const pending = Array.isArray(lead?.pendingAutomations) ? lead.pendingAutomations : [];
  const now = Date.now();
  return pending
    .filter((p) => p && p.sent !== true && p.key && p.sendAt)
    .map((p) => {
      const sendMs = new Date(p.sendAt).getTime();
      const cfg = automationConfig?.[p.key];
      const short = formatSendAtShort(p.sendAt);
      const labelKey = automationLabelForKey(p.key);
      const overdue = Number.isFinite(sendMs) && sendMs <= now;
      return {
        key: p.key,
        label: overdue ? `Envio pendente` : labelKey,
        title: overdue
          ? `${labelKey}: deveria ter sido enviada (${short})`
          : `${labelKey}: agendado para ${short}`,
        overdue,
      };
    });
}

/**
 * @param {AutomationOutcome[]} immediate
 * @param {{ key: string; sendAt: string }[]} scheduled
 */
export function buildAutomationFeedbackToasts(immediate = [], scheduled = []) {
  const toasts = [];
  for (const o of immediate) {
    const name = automationLabelForKey(o.automationKey);
    if (o.status === 'sent') {
      const via =
        o.channel === 'wa_me'
          ? 'Abra o WhatsApp para concluir o envio automático.'
          : 'Mensagem automática enviada.';
      toasts.push({ type: 'success', message: `${name}: ${via}` });
    } else if (o.status === 'failed') {
      const why = AUTOMATION_SKIP_REASONS[o.reason] || o.reason || 'Falha ao enviar';
      toasts.push({ type: 'warning', message: `${name}: ${why}` });
    } else if (o.status === 'skipped' && o.reason && o.reason !== 'inactive' && o.reason !== 'delayed') {
      const why = AUTOMATION_SKIP_REASONS[o.reason] || o.reason;
      toasts.push({ type: 'info', message: `${name} não enviada — ${why}` });
    }
  }
  for (const s of scheduled) {
    const name = automationLabelForKey(s.key);
    const when = formatSendAtShort(s.sendAt);
    toasts.push({ type: 'info', message: `${name} agendada para ${when}` });
  }
  return toasts;
}

export function notifyAutomationFeedback(addToast, result) {
  if (!addToast || !result) return;
  const toasts = buildAutomationFeedbackToasts(result.immediate || [], result.scheduled || []);
  for (const t of toasts) addToast(t);
}

/**
 * Envolve dispatch de automação para nunca engolir erros silenciosamente.
 * @param {Promise<{ immediate?: object[]; scheduled?: object[] } | null | undefined>} promise
 * @param {string} [fallbackKey]
 * @returns {Promise<{ immediate: object[]; scheduled: object[] }>}
 */
export async function safeAutomationDispatch(promise, fallbackKey = 'unknown') {
  try {
    const result = await promise;
    if (result && typeof result === 'object') {
      return {
        immediate: Array.isArray(result.immediate) ? result.immediate : [],
        scheduled: Array.isArray(result.scheduled) ? result.scheduled : [],
      };
    }
    return { immediate: [], scheduled: [] };
  } catch (e) {
    console.warn('[safeAutomationDispatch]', fallbackKey, e?.message || e);
    return {
      immediate: [{ status: 'failed', automationKey: fallbackKey, reason: 'send_failed' }],
      scheduled: [],
    };
  }
}

export function computeAutomationReadiness({ automationsConfig, templatesMap, waConnected, hasZapsterInstance }) {
  const entries = Object.entries(automationsConfig || {});
  const activeCount = entries.filter(([, c]) => c?.active === true).length;
  const templatesOk = Object.values(templatesMap || {}).some((v) => String(v || '').trim());
  const zapsterOk = Boolean(hasZapsterInstance && waConnected);
  const zapsterPartial = Boolean(hasZapsterInstance && !waConnected);

  const steps = [
    {
      id: 'templates',
      ok: templatesOk,
      label: templatesOk ? 'Modelos de mensagem disponíveis' : 'Revise os modelos em Modelos de Mensagem',
    },
    {
      id: 'zapster',
      ok: zapsterOk,
      label: zapsterOk
        ? 'WhatsApp conectado'
        : zapsterPartial
          ? 'WhatsApp desconectado — reconecte no Agente IA'
          : 'Conecte o WhatsApp no Agente IA',
    },
    {
      id: 'active',
      ok: activeCount > 0,
      label:
        activeCount > 0
          ? `${activeCount} gatilho${activeCount === 1 ? '' : 's'} ativo${activeCount === 1 ? '' : 's'}`
          : 'Gatilhos desligados por padrão — ative os que precisar',
    },
  ];

  const ready = steps.every((s) => s.ok);
  return { ready, steps, activeCount, templatesOk, zapsterOk };
}

export function previewAutomationMessage({ templateKey, templatesMap, academyName }) {
  const raw = templatesMap?.[templateKey];
  if (!raw || !String(raw).trim()) return '';
  return applyWhatsappTemplatePlaceholders(String(raw), {
    lead: {
      name: 'Maria Silva',
      scheduledDate: '2026-06-15',
      scheduledTime: '19:00',
    },
    academyName: academyName || 'Sua academia',
  });
}

export function formatWhatsappTemplateSentTimeline(d, payload = {}) {
  const templateKey = String(payload.templateKey || d.text || '').trim();
  const automationKey = String(payload.automationKey || '').trim();
  const tplLabel = WHATSAPP_TEMPLATE_LABELS[templateKey] || templateKey || 'mensagem';
  const autoLabel = automationKey ? automationLabelForKey(automationKey) : '';
  if (autoLabel) return `Automático (${autoLabel}): ${tplLabel}`;
  return `WhatsApp: ${tplLabel}`;
}

export function delayHintForAutomation(key, delayMinutes, ymd, time) {
  const delay = Number(delayMinutes) || 0;
  if (key === 'schedule_reminder' && ymd && delay > 0) {
    const [y, m, day] = String(ymd).split('-').map(Number);
    const [h, mi] = String(time || '19:00').split(':').map(Number);
    const classDt = new Date(y, (m || 1) - 1, day || 1, h || 19, mi || 0);
    classDt.setMinutes(classDt.getMinutes() - delay);
    return `Ex.: aula ${String(time || '19:00')} → envio ~${classDt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (key === 'waiting_decision' && delay > 0) {
    const hrs = delay / 60;
    if (hrs < 48) return `Envio ${hrs}h após entrar na etapa`;
    return `Envio ${Math.round(hrs / 24)} dia(s) após entrar na etapa`;
  }
  if (delay <= 0) return 'Envio imediato';
  return null;
}
