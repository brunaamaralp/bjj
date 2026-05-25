/**
 * Pessoas que podem ser vinculadas a tarefas (lead_id no backend).
 * Alunos matriculados vivem em students; leads ainda no funil em leads.
 */

export function buildTaskLinkablePeople(leads = [], students = []) {
  const byId = new Map();

  for (const l of leads) {
    const id = String(l?.id || '').trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(l.name || '').trim() || 'Sem nome',
      phone: String(l.phone || '').trim(),
      kind: 'lead',
    });
  }

  for (const s of students) {
    const id = String(s?.id || '').trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(s.name || '').trim() || 'Sem nome',
      phone: String(s.phone || '').trim(),
      kind: 'student',
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  );
}

export function filterTaskLinkablePeople(people, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return people;
  return people.filter((p) => {
    const name = p.name.toLowerCase();
    const phone = p.phone.replace(/\D/g, '');
    const qDigits = q.replace(/\D/g, '');
    return name.includes(q) || (qDigits && phone.includes(qDigits));
  });
}

export function profilePathForLinkablePerson(person) {
  if (!person?.id) return null;
  return person.kind === 'lead' ? `/lead/${person.id}` : `/student/${person.id}`;
}
