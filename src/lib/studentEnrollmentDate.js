import { LEAD_STATUS } from './leadStatus.js';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD no fuso local (evita deslocamento de toISOString). */
export function formatLocalYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Data de ingresso explícita (campo «Ingresso» no perfil do aluno).
 * Não usa convertedAt — evita incluir alunos só com data de conversão automática.
 */
export function enrollmentIngressYmd(contact) {
  const en = String(contact?.enrollmentDate || contact?.enrollment_date || '').trim().slice(0, 10);
  return YMD_RE.test(en) ? en : '';
}

/**
 * Data de matrícula/ingresso para ordenação e telas (ingresso → conversão).
 */
export function enrollmentDateYmd(contact) {
  const ingress = enrollmentIngressYmd(contact);
  if (ingress) return ingress;

  const conv = String(contact?.convertedAt || contact?.converted_at || '').trim().slice(0, 10);
  if (YMD_RE.test(conv)) return conv;

  return '';
}

/**
 * Data de matrícula para KPIs (ingresso explícito → converted_at).
 * @deprecated Preferir enrollmentDateYmd — mesma regra.
 */
export function matriculationYmd(contact) {
  return enrollmentDateYmd(contact);
}

/** Verifica se a matrícula cai no intervalo [from, to] (YYYY-MM-DD). Sem período = todos. */
export function contactEnrolledInYmdRange(contact, from, to) {
  if (!from && !to) return true;
  const ymd = enrollmentIngressYmd(contact);
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

export function isImportedSpreadsheetContact(contact) {
  return (
    String(contact?.origin || contact?.sourceOrigin || contact?.source_origin || '').trim() ===
    'Planilha'
  );
}

/** Aluno matriculado ou lead convertido elegível para KPI de matrículas. */
export function shouldCountEnrollmentContact(contact) {
  if (isImportedSpreadsheetContact(contact)) return false;
  if (contact?._isStudent || contact?.contact_type === 'student') return true;
  const status = String(contact?.status || '').trim();
  return status === LEAD_STATUS.CONVERTED;
}

/** Matrícula no período civil (ingresso → converted_at), comparando só YYYY-MM-DD. */
export function matriculationYmdInRange(contact, fromYmd, toYmd) {
  const ymd = enrollmentDateYmd(contact);
  if (!ymd) return false;
  if (fromYmd && ymd < fromYmd) return false;
  if (toYmd && ymd > toYmd) return false;
  return true;
}

/**
 * Conta matrículas no período sobre lista já deduplicada por id (servidor / relatórios).
 * @param {object[]} people
 * @param {string} fromYmd
 * @param {string} toYmd
 */
export function countEnrollmentsInPeoplePeriod(people, fromYmd, toYmd) {
  let count = 0;
  for (const contact of people || []) {
    if (!shouldCountEnrollmentContact(contact)) continue;
    if (!matriculationYmdInRange(contact, fromYmd, toYmd)) continue;
    count += 1;
  }
  return count;
}

/** Data de ingresso padrão: cadastro existente ou data de criação do lead. */
export function defaultEnrollmentDateIso(lead) {
  const existing = enrollmentDateYmd(lead);
  if (existing) return existing;

  const created = String(lead?.createdAt || '').trim();
  if (created && /^\d{4}-\d{2}-\d{2}/.test(created)) return created.slice(0, 10);
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) return formatLocalYmd(d);
  }
  return formatLocalYmd(new Date());
}
