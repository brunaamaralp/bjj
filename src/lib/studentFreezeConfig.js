/** Motivos de trancamento — gravados em academy.settings (JSON) ou legado student_freeze_reasons. */

import { parseAcademySettings } from './stockSettings.js';

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

export function readStudentFreezeReasonsFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw =
    settings.student_freeze_reasons ??
    settings.studentFreezeReasons ??
    settings.freezeReasons ??
    null;
  return parseStudentFreezeReasons(raw);
}

export function mergeFreezeReasonsIntoSettings(settingsRaw, reasons) {
  const base = parseAcademySettings(settingsRaw);
  const list = parseStudentFreezeReasons(
    Array.isArray(reasons) ? reasons : reasons == null ? null : reasons
  );
  return {
    ...base,
    student_freeze_reasons: list,
  };
}

/** Lê do documento academia (settings JSON ou atributo legado). */
export function readStudentFreezeReasonsFromAcademyDoc(doc) {
  const settings = parseAcademySettings(doc?.settings);
  if (
    settings.student_freeze_reasons != null ||
    settings.studentFreezeReasons != null ||
    settings.freezeReasons != null
  ) {
    return parseStudentFreezeReasons(
      settings.student_freeze_reasons ?? settings.studentFreezeReasons ?? settings.freezeReasons
    );
  }
  const raw = doc?.student_freeze_reasons ?? doc?.studentFreezeReasons ?? '';
  return parseStudentFreezeReasons(raw);
}
