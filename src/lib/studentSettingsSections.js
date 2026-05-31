import { parseStudentExitReasons } from './studentExitConfig.js';
import { parseStudentFreezeReasons } from './studentFreezeConfig.js';
import { readPublicEnrollment } from './publicEnrollmentSettings.js';
import { readAcademyTurmas } from './academyTurmas.js';

/** Slugs em ?tab=alunos&section= */
export const STUDENT_SETTINGS_SECTIONS = {
  DESLIGAMENTO: 'desligamento',
  TRANCAMENTO: 'trancamento',
  MATRICULA: 'matricula-online',
  TURMAS: 'turmas',
};

const VALID = new Set(Object.values(STUDENT_SETTINGS_SECTIONS));

export function isStudentSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export const STUDENT_SETTINGS_ITEMS = [
  {
    id: STUDENT_SETTINGS_SECTIONS.DESLIGAMENTO,
    label: 'Motivos de desligamento',
    hint: 'Opções ao encerrar uma matrícula',
  },
  {
    id: STUDENT_SETTINGS_SECTIONS.TRANCAMENTO,
    label: 'Motivos de trancamento',
    hint: 'Opções ao pausar uma matrícula',
  },
  {
    id: STUDENT_SETTINGS_SECTIONS.MATRICULA,
    label: 'Matrícula online',
    hint: 'Link público para novos alunos',
  },
  {
    id: STUDENT_SETTINGS_SECTIONS.TURMAS,
    label: 'Turmas',
    hint: 'Grupos exibidos no cadastro',
  },
];

export function buildStudentSettingsSummaries({ academy, turmasCount = null }) {
  const reasons = parseStudentExitReasons(academy?.studentExitReasons);
  const freezeReasons = parseStudentFreezeReasons(academy?.studentFreezeReasons);
  const enrollment = readPublicEnrollment(academy?.settings);

  const turmas =
    turmasCount != null
      ? turmasCount
      : readAcademyTurmas(academy?.settings).length;

  return {
    [STUDENT_SETTINGS_SECTIONS.DESLIGAMENTO]: {
      summary:
        reasons.length === 0
          ? 'Nenhum motivo'
          : `${reasons.length} motivo${reasons.length === 1 ? '' : 's'}`,
      done: reasons.length > 0,
    },
    [STUDENT_SETTINGS_SECTIONS.TRANCAMENTO]: {
      summary:
        freezeReasons.length === 0
          ? 'Nenhum motivo'
          : `${freezeReasons.length} motivo${freezeReasons.length === 1 ? '' : 's'}`,
      done: freezeReasons.length > 0,
    },
    [STUDENT_SETTINGS_SECTIONS.MATRICULA]: {
      summary: enrollment.enabled ? 'Ativa' : 'Desativada',
      done: enrollment.enabled,
    },
    [STUDENT_SETTINGS_SECTIONS.TURMAS]: {
      summary: turmas === 0 ? 'Nenhuma turma' : `${turmas} turma${turmas === 1 ? '' : 's'}`,
      done: turmas > 0,
    },
  };
}
