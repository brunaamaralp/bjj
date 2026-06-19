export const HORARIOS_SETTINGS_SECTIONS = {
  TURMAS: 'turmas',
  HORARIOS: 'horarios',
};

export const HORARIOS_SETTINGS_ITEMS = [
  {
    id: HORARIOS_SETTINGS_SECTIONS.TURMAS,
    label: 'Turmas',
    shortLabel: 'Turmas',
    hint: 'Catálogo de turmas da academia',
  },
  {
    id: HORARIOS_SETTINGS_SECTIONS.HORARIOS,
    label: 'Horários',
    shortLabel: 'Horários',
    hint: 'Horários recorrentes das turmas',
  },
];

export const HORARIOS_DEFAULT_SECTION = HORARIOS_SETTINGS_SECTIONS.TURMAS;

export function isHorariosSettingsSection(raw) {
  const s = String(raw || '').trim();
  if (s === HORARIOS_SETTINGS_SECTIONS.TURMAS) return s;
  if (s === HORARIOS_SETTINGS_SECTIONS.HORARIOS) return s;
  return null;
}
