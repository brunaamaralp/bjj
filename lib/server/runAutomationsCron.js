/**
 * Processa fila pending_automations (schedule_reminder, followup_d1_attended, waiting_decision).
 *
 * NOTA: sem mutex entre invocações paralelas (cron a cada 15 min + safety net diário).
 * sent=true é gravado APÓS envio Zapster bem-sucedido (ou skip no_recent_interaction).
 * Duas invocações simultâneas no mesmo item podem enviar duplicado — débito técnico; ver AGENTS.md.
 *
 * has_pending_automations: atualizado para false quando não restam entradas com sent !== true
 * (inclui itens futuros ainda não vencidos — lead permanece na fila até todos enviados/cancelados).
 */
import { Query } from 'node-appwrite';
import { DB_ID, ACADEMIES_COL } from '../../src/services/planService.js';
import { parseAutomationsConfig, parsePendingAutomations } from '../automationCore.js';
import { sendAutomationTemplateCron } from './sendAutomationCron.js';
import { hasFollowupContactSinceClass } from './followupContactServer.js';

const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

/** Margem de segurança para Vercel Hobby (limite serverless ~10s). */
export const AUTOMATIONS_CRON_MAX_MS = 9_000;
/** Leads por página Appwrite (convenção do projeto; Appwrite permite até 5000). */
export const AUTOMATIONS_CRON_PAGE_SIZE = 100;
/** Máximo de páginas por invocação (até 500 leads). */
export const AUTOMATIONS_CRON_MAX_PAGES = 5;

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{ maxMs?: number; pageSize?: number; maxPages?: number }} [options] — overrides para testes
 */
export async function runAutomations(databases, options = {}) {
  const maxMs = options.maxMs ?? AUTOMATIONS_CRON_MAX_MS;
  const pageSize = options.pageSize ?? AUTOMATIONS_CRON_PAGE_SIZE;
  const maxPages = options.maxPages ?? AUTOMATIONS_CRON_MAX_PAGES;

  const academyCache = new Map();
  let scanned = 0;
  let due = 0;
  let sent = 0;
  let errors = 0;
  const now = Date.now();
  const t0 = Date.now();

  if (!LEADS_COL) {
    return {
      scanned,
      due,
      sent,
      errors,
      hasMore: false,
      pages: 0,
      skipped: 'leads_collection_missing',
    };
  }

  let cursor = null;
  let pageIndex = 0;
  let hasMore = false;

  while (pageIndex < maxPages) {
    if (Date.now() - t0 >= maxMs) {
      hasMore = true;
      break;
    }

    const queries = [
      Query.equal('has_pending_automations', [true]),
      Query.limit(pageSize),
      Query.orderAsc('$id'),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const result = await databases.listDocuments(DB_ID, LEADS_COL, queries);
    const docs = result.documents || [];

    if (!docs.length) {
      hasMore = false;
      break;
    }

    let stopPaging = false;
    for (const doc of docs) {
      if (Date.now() - t0 >= maxMs) {
        hasMore = true;
        stopPaging = true;
        break;
      }
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

    if (stopPaging) break;

    if (docs.length < pageSize) {
      hasMore = false;
      break;
    }

    if (pageIndex + 1 >= maxPages) {
      hasMore = true;
      break;
    }

    cursor = docs[docs.length - 1].$id;
    pageIndex += 1;
  }

  const out = { scanned, due, sent, errors, hasMore, pages: pageIndex + 1 };
  console.log('[cron/automations]', out);
  return out;
}
