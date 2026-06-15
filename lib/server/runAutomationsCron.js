/**
 * Processa fila pending_automations (schedule_reminder, followup_d1_attended, waiting_decision).
 *
 * NOTA: sem mutex entre invocações paralelas (cron a cada 15 min + safety net diário).
 * sent=true é gravado APÓS envio Zapster bem-sucedido (ou skip no_recent_interaction).
 * Duas invocações simultâneas no mesmo item podem enviar duplicado — débito técnico; ver AGENTS.md.
 */
import { Query } from 'node-appwrite';
import { DB_ID, ACADEMIES_COL } from '../../src/services/planService.js';
import { parseAutomationsConfig, parsePendingAutomations } from '../automationCore.js';
import { sendAutomationTemplateCron } from './sendAutomationCron.js';
import { hasFollowupContactSinceClass } from './followupContactServer.js';

const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

/** @param {import('node-appwrite').Databases} databases */
export async function runAutomations(databases) {
  const academyCache = new Map();
  let scanned = 0;
  let due = 0;
  let sent = 0;
  let errors = 0;
  const now = Date.now();
  const MAX_MS = 9000;
  const t0 = Date.now();

  if (!LEADS_COL) return { scanned, due, sent, errors, skipped: 'leads_collection_missing' };

  const page = await databases.listDocuments(DB_ID, LEADS_COL, [
    Query.equal('has_pending_automations', [true]),
    Query.limit(100),
  ]);
  const docs = page.documents || [];
  for (const doc of docs) {
    if (Date.now() - t0 >= MAX_MS) break;
    scanned += 1;
    const pending = parsePendingAutomations(doc.pending_automations);
    if (!pending.some((p) => p.sent !== true)) continue;

    const academyId = String(doc.academyId || '').trim();
    if (!academyId) continue;
    if (!academyCache.has(academyId)) {
      try {
        const academy = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        academyCache.set(academyId, academy);
      } catch {
        academyCache.set(academyId, null);
      }
    }
    const academy = academyCache.get(academyId);
    if (!academy) continue;

    let changed = false;
    const cfgMap = parseAutomationsConfig(academy.automations_config);

    const nextPending = [...pending];
    for (let i = 0; i < nextPending.length; i += 1) {
      const item = nextPending[i];
      if (item.sent === true) continue;
      const sendAtMs = new Date(item.sendAt).getTime();
      if (!Number.isFinite(sendAtMs) || sendAtMs > now) continue;
      due += 1;

      const cfg = cfgMap?.[item.key];
      if (!cfg?.active) {
        nextPending[i] = { ...item, sent: true };
        changed = true;
        continue;
      }

      if (item.key === 'followup_d1_attended') {
        const classYmd = String(doc.scheduledDate || doc.attendedAt || '').slice(0, 10);
        const already = await hasFollowupContactSinceClass(databases, academyId, doc.$id, classYmd);
        if (already) {
          nextPending[i] = { ...item, sent: true };
          changed = true;
          continue;
        }
      }

      const out = await sendAutomationTemplateCron({
        leadDoc: doc,
        academy,
        automationKey: item.key,
        templateKey: cfg.templateKey,
      });
      if (!out?.ok) {
        if (out?.skipped === 'no_recent_interaction') {
          nextPending[i] = { ...item, sent: true };
          changed = true;
          continue;
        }
        errors += 1;
        continue;
      }
      sent += 1;
      nextPending[i] = { ...item, sent: true };
      changed = true;
    }
    if (changed) {
      try {
        const stillHasPending = nextPending.some((p) => p.sent !== true);
        await databases.updateDocument(DB_ID, LEADS_COL, doc.$id, {
          pending_automations: JSON.stringify(nextPending),
          has_pending_automations: stillHasPending,
        });
      } catch {
        errors += 1;
      }
    }
  }

  return { scanned, due, sent, errors };
}
