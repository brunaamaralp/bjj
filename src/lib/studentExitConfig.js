/** Motivos de saída do aluno — configuráveis por academia (documento ACADEMIES). */

export const DEFAULT_STUDENT_EXIT_REASONS = [
  'Cancelamento voluntário',
  'Inadimplência',
  'Encerramento de contrato',
  'Mudança de cidade',
  'Problema de saúde',
  'Questão financeira',
  'Insatisfação',
  'Outro',
];

const EXIT_REASONS_OTHER = 'Outro';

export function parseStudentExitReasons(raw) {
  let list = [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      list = parsed.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch {
    list = [];
  }
  if (list.length === 0) return [...DEFAULT_STUDENT_EXIT_REASONS];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  if (!out.some((r) => r.toLowerCase() === EXIT_REASONS_OTHER.toLowerCase())) {
    out.push(EXIT_REASONS_OTHER);
  }
  return out;
}

export function serializeStudentExitReasons(reasons) {
  const arr = Array.isArray(reasons) ? reasons : [];
  return JSON.stringify(
    arr.map((x) => String(x || '').trim()).filter(Boolean)
  );
}

export function readStudentExitReasonsFromAcademyDoc(doc) {
  const raw =
    doc?.student_exit_reasons ??
    doc?.studentExitReasons ??
    '';
  return parseStudentExitReasons(raw);
}
