/** Motivos de desligamento — gravados em academy.settings (JSON) ou legado student_exit_reasons. */

import { parseAcademySettings } from './stockSettings.js';

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

export function readStudentExitReasonsFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw =
    settings.student_exit_reasons ??
    settings.studentExitReasons ??
    settings.exitReasons ??
    null;
  return parseStudentExitReasons(raw);
}

export function mergeExitReasonsIntoSettings(settingsRaw, reasons) {
  const base = parseAcademySettings(settingsRaw);
  const list = parseStudentExitReasons(
    Array.isArray(reasons) ? reasons : reasons == null ? null : reasons
  );
  return {
    ...base,
    student_exit_reasons: list,
  };
}

export function readStudentExitReasonsFromAcademyDoc(doc) {
  const settings = parseAcademySettings(doc?.settings);
  if (
    settings.student_exit_reasons != null ||
    settings.studentExitReasons != null ||
    settings.exitReasons != null
  ) {
    return parseStudentExitReasons(
      settings.student_exit_reasons ?? settings.studentExitReasons ?? settings.exitReasons
    );
  }
  const raw = doc?.student_exit_reasons ?? doc?.studentExitReasons ?? '';
  return parseStudentExitReasons(raw);
}
