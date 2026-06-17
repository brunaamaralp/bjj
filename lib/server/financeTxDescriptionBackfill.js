import {
  financeCategoryLabelFromDoc,
  financeUserNoteFromStored,
} from './financeTxFields.js';

const GENERIC_DESCRIPTIONS = new Set(['despesa', 'lancamento', 'lançamento', 'transacao', 'transação']);

/**
 * Decide se uma note legada pode virar planName (descrição na lista).
 * @param {object} doc documento FINANCIAL_TX (ou mapped)
 * @param {{ templatePlanName?: string }} [ctx]
 * @returns {{ action: 'skip'|'update'|'unresolved', planName?: string, source?: string, reason?: string }}
 */
export function resolveFinanceTxDescriptionBackfill(doc, ctx = {}) {
  const existing = String(doc?.planName || '').trim();
  if (existing) {
    return { action: 'skip', reason: 'has_planName', planName: existing };
  }

  const userNote = financeUserNoteFromStored(doc?.note);
  if (userNote && !isGenericFinanceDescription(userNote, doc)) {
    return { action: 'update', planName: userNote.slice(0, 200), source: 'note' };
  }

  const templatePlanName = String(ctx.templatePlanName || '').trim();
  if (templatePlanName && !isGenericFinanceDescription(templatePlanName, doc)) {
    return { action: 'update', planName: templatePlanName.slice(0, 200), source: 'template' };
  }

  return { action: 'unresolved', reason: userNote ? 'generic_note' : 'no_source' };
}

export function isGenericFinanceDescription(text, doc) {
  const value = String(text || '').trim();
  if (!value) return true;

  const normalized = value.toLowerCase();
  if (GENERIC_DESCRIPTIONS.has(normalized)) return true;

  const category = String(doc?.category || financeCategoryLabelFromDoc(doc) || '')
    .trim()
    .toLowerCase();
  if (category && normalized === category) return true;

  return false;
}
