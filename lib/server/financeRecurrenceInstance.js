/**
 * Geração de instâncias FINANCIAL_TX a partir de templates recorrentes (A pagar / cron).
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { createDocumentResilient } from './appwriteSchemaResilient.js';
import {
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  financeTxDocumentWithOptionals,
  normalizeRecurrenceType,
} from './financeTxFields.js';
import { recordAcademyEvent, FINANCE_RECURRENCE_EVENT_TYPES } from './academyEvents.js';
import {
  dueDateForRecurrenceMonth,
  competenceMonthFromYmd,
} from '../../src/lib/financeRecurrenceDedup.js';
import {
  addDaysYmd,
  currentYmFinance,
  financeDateParts,
  todayYmdFinance,
} from '../../src/lib/financeForecastCore.js';

const WEEKDAY_TO_DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function shouldRunRecurrenceToday(template, date = new Date()) {
  const type = normalizeRecurrenceType(template.recurrence_type);
  const day = Number(template.recurrence_day) || 1;
  const { day: dom, weekday } = financeDateParts(date);
  if (type === 'monthly') {
    const recurrenceDom = Math.min(28, Math.max(1, day));
    return dom === recurrenceDom;
  }
  if (type === 'weekly') {
    const dow = Math.min(6, Math.max(0, Math.trunc(day)));
    const currentDow = WEEKDAY_TO_DOW[weekday] ?? date.getDay();
    return currentDow === dow;
  }
  return false;
}

export function competenceYmForRecurrence(template, date = new Date()) {
  const due = String(template.due_date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return competenceMonthFromYmd(due) || currentYmFinance(date);
  }
  return currentYmFinance(date);
}

/** Primeira instância no cadastro quando vencimento está dentro de 30 dias. */
export function shouldCreateInitialPayableInstance(template, todayYmd = todayYmdFinance()) {
  if (template?.is_recurrence_template !== true) return false;
  const type = normalizeRecurrenceType(template.recurrence_type);
  if (type === 'none') return false;
  const due = String(template.due_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return true;
  return due <= addDaysYmd(todayYmd, 30);
}

export async function alreadyGeneratedForPeriod(databases, dbId, colId, templateId, academyId, template) {
  const type = normalizeRecurrenceType(template.recurrence_type);
  if (type === 'monthly') {
    const ym = competenceYmForRecurrence(template);
    try {
      const res = await databases.listDocuments(dbId, colId, [
        Query.equal('academyId', academyId),
        Query.equal('recurrence_origin_id', templateId),
        Query.equal('competence_month', ym),
        Query.limit(1),
      ]);
      return (res.total || 0) > 0;
    } catch (e) {
      if (String(e?.message || '').includes('Unknown attribute')) return false;
      throw e;
    }
  }
  if (type === 'weekly') {
    const { year, month, day } = financeDateParts();
    const start = new Date(Date.UTC(year, month - 1, day));
    const dow = start.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    start.setUTCDate(start.getUTCDate() + diff);
    const weekStart = start.toISOString();
    const endDate = new Date(start);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);
    try {
      const res = await databases.listDocuments(dbId, colId, [
        Query.equal('academyId', academyId),
        Query.equal('recurrence_origin_id', templateId),
        Query.greaterThanEqual('$createdAt', weekStart),
        Query.lessThanEqual('$createdAt', endDate.toISOString()),
        Query.limit(1),
      ]);
      return (res.total || 0) > 0;
    } catch (e) {
      if (String(e?.message || '').includes('Unknown attribute')) return false;
      throw e;
    }
  }
  return false;
}

export async function findPayableInstanceForPeriod(databases, dbId, colId, templateId, academyId, competenceMonth) {
  const ym = String(competenceMonth || '').trim();
  if (!ym) return null;
  try {
    const res = await databases.listDocuments(dbId, colId, [
      Query.equal('academyId', academyId),
      Query.equal('recurrence_origin_id', templateId),
      Query.equal('competence_month', ym),
      Query.limit(1),
    ]);
    return res.documents?.[0] || null;
  } catch (e) {
    if (String(e?.message || '').includes('Unknown attribute')) return null;
    throw e;
  }
}

export async function createPayableInstanceFromTemplate(databases, dbId, colId, template, overrides = {}) {
  const academyId = String(template.academyId || '');
  const templateId = template.$id || template.id;
  const ym = String(overrides.competence_month || '').trim() || competenceYmForRecurrence(template);
  const dueDate =
    String(overrides.due_date || '').slice(0, 10) ||
    String(template.due_date || '').slice(0, 10) ||
    dueDateForRecurrenceMonth(template.recurrence_day, ym) ||
    '';

  const payload = buildFinanceTxPayload(
    {
      academyId,
      type: template.type,
      category: template.category,
      gross: template.gross,
      fee: template.fee,
      net: template.net,
      direction: template.direction || 'out',
      method: template.method,
      installments: template.installments,
      planName: template.planName,
      note: template.note,
      lead_id: template.lead_id,
      status: 'pending',
      competence_month: ym,
      due_date: dueDate,
      recurrence_origin_id: templateId,
      is_recurrence_template: false,
      recurrence_type: 'none',
    },
    {
      created_by: 'system',
      updated_by: 'system',
      origin_type: 'recurrence',
      origin_id: templateId,
    }
  );

  const forDb = financeTxDocumentWithOptionals(payload);
  const doc = await createDocumentResilient(
    databases,
    dbId,
    colId,
    ID.unique(),
    forDb,
    [Permission.read(Role.users()), Permission.update(Role.users())]
  );

  await recordAcademyEvent({
    event_type: FINANCE_RECURRENCE_EVENT_TYPES.GENERATED,
    academy_id: academyId,
    actor_user_id: 'system',
    actor_name: 'Sistema',
    template_id: templateId,
    tx_id: doc.$id,
    target_id: doc.$id,
    amount: template.gross,
    category: template.category,
    timestamp: new Date().toISOString(),
  });

  return doc.$id;
}

/**
 * Garante instância pendente para liquidar conta fixa antes do vencimento (ou na data projetada).
 * Reutiliza instância pending existente; cria nova se ainda não houver para a competência.
 */
export async function resolvePayableInstanceForSettle(databases, dbId, colId, template, dueYmd) {
  if (template?.is_recurrence_template !== true) {
    throw new Error('not_recurrence_template');
  }
  const due = String(dueYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    throw new Error('invalid_due_date');
  }
  const templateId = template.$id || template.id;
  const academyId = String(template.academyId || '');
  const ym = competenceMonthFromYmd(due) || competenceYmForRecurrence(template);

  const existing = await findPayableInstanceForPeriod(databases, dbId, colId, templateId, academyId, ym);
  if (existing) {
    const st = String(existing.status || '').toLowerCase();
    if (st === 'settled') throw new Error('already_settled');
    if (st === 'cancelled') throw new Error('cannot_settle_cancelled');
    return existing;
  }

  const txId = await createPayableInstanceFromTemplate(databases, dbId, colId, template, {
    due_date: due,
    competence_month: ym,
  });
  return databases.getDocument(dbId, colId, txId);
}

export async function ensureInitialPayableInstance(databases, dbId, colId, templateDoc) {
  if (!shouldCreateInitialPayableInstance(templateDoc)) {
    return { created: false, reason: 'due_beyond_horizon' };
  }
  const templateId = templateDoc.$id;
  const academyId = String(templateDoc.academyId || '');
  if (await alreadyGeneratedForPeriod(databases, dbId, colId, templateId, academyId, templateDoc)) {
    return { created: false, reason: 'already_exists' };
  }
  const txId = await createPayableInstanceFromTemplate(databases, dbId, colId, templateDoc);
  return { created: true, txId };
}
