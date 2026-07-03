/**
 * Guardas puros para impedir liquidação de templates de recorrência (is_recurrence_template=true).
 * Instâncias têm recurrence_origin_id e is_recurrence_template false/ausente.
 */
import {
  FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE,
  FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE,
} from '../constants.js';

export function isRecurrenceTemplate(doc) {
  return doc?.is_recurrence_template === true;
}

/** Retorna código de erro ou null se o documento pode ser liquidado. */
export function recurrenceTemplateSettleError(doc) {
  if (isRecurrenceTemplate(doc)) return FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE;
  return null;
}

/** Lança se doc for template de recorrência (para caminhos server-side). */
export function assertNotRecurrenceTemplate(doc) {
  const code = recurrenceTemplateSettleError(doc);
  if (code) {
    const err = new Error(code);
    err.userMessage = FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE;
    throw err;
  }
}

/**
 * Valida create/import com receive_now ou status settled em template.
 * @returns {string|null} código de erro ou null
 */
export function validateNotSettledRecurrenceTemplate(input = {}) {
  const isTemplate =
    input.is_recurrence_template === true || input.repeat_enabled === true;
  const wouldSettle = input.receive_now === true || String(input.status || '').toLowerCase() === 'settled';
  if (isTemplate && wouldSettle) return FINANCE_CANNOT_SETTLE_RECURRENCE_TEMPLATE_CODE;
  return null;
}
