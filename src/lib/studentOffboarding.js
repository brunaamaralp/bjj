/**
 * Checklist configurável na academia (referência na UI).
 * Tarefas automáticas no desligamento usam o template STUDENT_EXIT — ver deactivateStudent.js.
 */

export const DEFAULT_OFFBOARDING_CHECKLIST = [
  'Encerrar cobranças e pendências financeiras',
  'Remover das turmas e da agenda',
  'Comunicar encerramento ao aluno',
  'Coletar materiais ou equipamentos emprestados',
  'Atualizar documentação interna',
];

export function parseOffboardingChecklist(raw) {
  let list = [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      list = parsed.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch {
    list = [];
  }
  return list.length > 0 ? list : [...DEFAULT_OFFBOARDING_CHECKLIST];
}

export function serializeOffboardingChecklist(items) {
  const arr = Array.isArray(items) ? items : [];
  return JSON.stringify(arr.map((x) => String(x || '').trim()).filter(Boolean));
}

export function readOffboardingChecklistFromAcademyDoc(doc) {
  const raw =
    doc?.student_offboarding_checklist ?? doc?.studentOffboardingChecklist ?? '';
  return parseOffboardingChecklist(raw);
}

export function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDeactivateNote({ exitReason, exitDate, exitNotes }) {
  const parts = [`Aluno desligado. Motivo: ${exitReason || '—'}.`];
  if (exitDate) {
    try {
      const br = new Date(`${String(exitDate).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
      parts.push(`Data de saída: ${br}.`);
    } catch {
      parts.push(`Data de saída: ${exitDate}.`);
    }
  }
  const notes = String(exitNotes || '').trim();
  if (notes) parts.push(notes);
  return parts.join(' ').slice(0, 1000);
}
