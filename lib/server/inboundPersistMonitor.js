import { logStructured } from './structuredLog.js';

const WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_THRESHOLD = 5;
const failures = [];

function prune(now) {
  while (failures.length && failures[0] < now - WINDOW_MS) failures.shift();
}

/**
 * Registra falha ao persistir inbound; dispara alerta após N falhas na janela.
 */
export async function recordInboundPersistFailure({ academyId, phone, messageId, error }) {
  const now = Date.now();
  prune(now);
  failures.push(now);
  logStructured('inbound_persist_failed', {
    academy_id: academyId,
    phone,
    message_id: messageId,
    error: error || 'unknown',
  });

  const threshold = Math.max(1, Number(process.env.INBOUND_FAIL_ALERT_THRESHOLD) || DEFAULT_THRESHOLD);
  if (failures.length < threshold) return;

  const alertUrl = String(process.env.INBOUND_FAIL_ALERT_WEBHOOK_URL || '').trim();
  const payload = {
    text: `[Nave Inbox] ${failures.length} falhas ao persistir mensagens inbound nos últimos 5 min.`,
    academy_id: academyId,
    phone,
    message_id: messageId,
  };
  logStructured('inbound_persist_alert', { ...payload, error: 'threshold_exceeded' });

  if (alertUrl) {
    try {
      await fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      logStructured('inbound_persist_alert_failed', { error: e?.message || String(e) });
    }
  }
}
