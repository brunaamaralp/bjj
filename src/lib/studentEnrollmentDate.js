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
 * Data de matrícula/ingresso para filtros e relatórios.
 * Prioriza enrollmentDate; convertedAt como fallback.
 * Não usa $createdAt — evita falsos positivos após migração lead→student.
 */
export function enrollmentDateYmd(contact) {
  const en = String(contact?.enrollmentDate || contact?.enrollment_date || '').trim().slice(0, 10);
  if (YMD_RE.test(en)) return en;

  const conv = String(contact?.convertedAt || contact?.converted_at || '').trim().slice(0, 10);
  if (YMD_RE.test(conv)) return conv;

  return '';
}

/** Verifica se a matrícula cai no intervalo [from, to] (YYYY-MM-DD). Sem datas = passa. */
export function contactEnrolledInYmdRange(contact, from, to) {
  if (!from && !to) return true;
  const ymd = enrollmentDateYmd(contact);
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
