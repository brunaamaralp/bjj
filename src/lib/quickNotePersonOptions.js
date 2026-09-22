import { isStudentRecord } from './studentStatus.js';

/**
 * Monta opções de pessoa (lead + aluno) para o seletor de nota rápida.
 * Dedupa por id; se existir em ambas as listas, marca como aluno.
 *
 * @param {object[]} leads
 * @param {object[]} students
 * @returns {{ value: string, label: string, searchText: string, kind: 'student'|'lead' }[]}
 */
export function buildQuickNotePersonOptions(leads = [], students = []) {
  const byId = new Map();

  for (const lead of Array.isArray(leads) ? leads : []) {
    const id = String(lead?.id || lead?.$id || '').trim();
    if (!id) continue;
    const name = String(lead?.name || '').trim() || 'Sem nome';
    const phone = String(lead?.phone || lead?.phone_number || '').trim();
    const kind = isStudentRecord(lead) ? 'student' : 'lead';
    const badge = kind === 'student' ? 'Aluno' : 'Lead';
    byId.set(id, {
      value: id,
      label: `${name} (${badge})`,
      searchText: `${name} ${phone}`.trim(),
      kind,
    });
  }

  for (const student of Array.isArray(students) ? students : []) {
    const id = String(student?.id || student?.$id || '').trim();
    if (!id) continue;
    const name = String(student?.name || '').trim() || 'Sem nome';
    const phone = String(student?.phone || student?.phone_number || '').trim();
    byId.set(id, {
      value: id,
      label: `${name} (Aluno)`,
      searchText: `${name} ${phone}`.trim(),
      kind: 'student',
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })
  );
}
