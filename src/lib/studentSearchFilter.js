function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Filtra alunos para busca (Inbox / funil).
 * @param {object[]} students
 * @param {object} opts
 * @param {string} [opts.query]
 * @param {string} [opts.phoneHint] — telefone da conversa (prioriza match)
 * @param {number} [opts.limit]
 */
export function filterStudentCandidates(students, { query = '', phoneHint = '', limit = 20 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const qPhone = normalizePhone(q);
  const hintPhone = normalizePhone(phoneHint);
  const all = Array.isArray(students) ? students : [];

  let list = all;
  if (!q && hintPhone) {
    list = all.filter((s) => {
      const phone = normalizePhone(s?.phone);
      return phone && (phone === hintPhone || phone.endsWith(hintPhone) || hintPhone.endsWith(phone));
    });
    if (list.length === 0) list = all;
  } else if (qPhone) {
    list = all.filter((s) => normalizePhone(s?.phone).includes(qPhone));
  } else if (q) {
    list = all.filter((s) => String(s?.name || '').toLowerCase().includes(q));
  }

  return list.slice(0, limit);
}
