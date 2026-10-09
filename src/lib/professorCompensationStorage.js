import { parseAcademySettings } from './stockSettings.js';
import { normalizeProfessorCompensation } from '../../lib/professorCompensation.js';

export const PROFESSOR_COMPENSATION_SETTINGS_KEY = 'professorCompensation';

export function readProfessorCompensationFromAcademy(academyDoc) {
  const settings = parseAcademySettings(academyDoc?.settings ?? academyDoc?.settings_json);
  return normalizeProfessorCompensation(settings[PROFESSOR_COMPENSATION_SETTINGS_KEY]);
}

export function mergeProfessorCompensationIntoSettings(rawSettings, compensation) {
  const base = parseAcademySettings(rawSettings);
  return {
    ...base,
    [PROFESSOR_COMPENSATION_SETTINGS_KEY]: normalizeProfessorCompensation(compensation),
  };
}
