import {
  STUDENT_DEFAULT_SECTION,
  STUDENT_SETTINGS_ITEMS,
  isStudentSettingsSection,
} from './studentSettingsSections.js';
import {
  HORARIOS_SETTINGS_ITEMS,
  isHorariosSettingsSection,
} from './horariosSettingsSections.js';

export const ALUNOS_AULAS_SETTINGS_ITEMS = [...STUDENT_SETTINGS_ITEMS, ...HORARIOS_SETTINGS_ITEMS];

export const ALUNOS_AULAS_DEFAULT_SECTION = STUDENT_DEFAULT_SECTION;

export function isAlunosAulasSettingsSection(raw) {
  return isHorariosSettingsSection(raw) || isStudentSettingsSection(raw);
}
