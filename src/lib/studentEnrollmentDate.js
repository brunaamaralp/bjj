/** Data de ingresso padrão: cadastro existente ou data de criação do lead. */
export function defaultEnrollmentDateIso(lead) {
  const existing = String(lead?.enrollmentDate || '').trim();
  if (existing) {
    if (/^\d{4}-\d{2}-\d{2}/.test(existing)) return existing.slice(0, 10);
    return existing;
  }
  const created = String(lead?.createdAt || '').trim();
  if (created && /^\d{4}-\d{2}-\d{2}/.test(created)) return created.slice(0, 10);
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}
