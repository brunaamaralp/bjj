/** Motivos de trancamento de matrícula — configuráveis por academia (documento ACADEMIES). */

export const DEFAULT_STUDENT_FREEZE_REASONS = [
  'Viagem',
  'Licença médica',
  'Serviço militar',
  'Licença acadêmica ou trabalho',
  'Questão familiar',
  'Outro',
];

const FREEZE_REASONS_OTHER = 'Outro';

export function parseStudentFreezeReasons(raw) {
  let list = [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      list = parsed.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch {
    list = [];
  }
  if (list.length === 0) return [...DEFAULT_STUDENT_FREEZE_REASONS];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  if (!out.some((r) => r.toLowerCase() === FREEZE_REASONS_OTHER.toLowerCase())) {
    out.push(FREEZE_REASONS_OTHER);
  }
  return out;
}

export function serializeStudentFreezeReasons(reasons) {
  const arr = Array.isArray(reasons) ? reasons : [];
  return JSON.stringify(arr.map((x) => String(x || '').trim()).filter(Boolean));
}

export function readStudentFreezeReasonsFromAcademyDoc(doc) {
  const raw =
    doc?.student_freeze_reasons ??
    doc?.studentFreezeReasons ??
    '';
  return parseStudentFreezeReasons(raw);
}
