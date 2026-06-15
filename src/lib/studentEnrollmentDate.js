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
