import { parseAcademySettings } from './stockSettings.js';

export const DEFAULT_BELT_GRADES = [
  'Branca',
  'Azul',
  'Roxa',
  'Marrom',
  'Preta',
];

export function parseBeltGradesFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.beltGrades;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

export function serializeBeltGrades(list) {
  return JSON.stringify(parseBeltGradesList(list));
}

export function parseBeltGradesList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const label = String(item || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function mergeBeltGradesIntoSettings(settingsRaw, list) {
  const base = parseAcademySettings(settingsRaw);
  const grades = parseBeltGradesList(list);
  if (grades.length === 0) {
    const { beltGrades: _removed, ...rest } = base;
    return rest;
  }
  return { ...base, beltGrades: grades };
}
