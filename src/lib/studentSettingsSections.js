import { parseStudentExitReasons } from './studentExitConfig.js';
import { parseStudentFreezeReasons } from './studentFreezeConfig.js';
import { readPublicEnrollment } from './publicEnrollmentSettings.js';
import { resolveAcademyTurmaLabels } from './academyTurmas.js';
import { parseBeltGradesFromSettings } from './beltGradesConfig.js';

/** Slugs em ?tab=alunos&section= */
export const STUDENT_SETTINGS_SECTIONS = {
  CAMPOS: 'campos-personalizados',
  GRADUACOES: 'graduacoes',
  MATRICULA: 'matricula',
};

const VALID = new Set(Object.values(STUDENT_SETTINGS_SECTIONS));

const LEGACY_SECTION_MAP = {
  desligamento: STUDENT_SETTINGS_SECTIONS.CAMPOS,
  trancamento: STUDENT_SETTINGS_SECTIONS.CAMPOS,
  turmas: STUDENT_SETTINGS_SECTIONS.CAMPOS,
  'matricula-online': STUDENT_SETTINGS_SECTIONS.MATRICULA,
};

export function isStudentSettingsSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (VALID.has(id)) return id;
  return LEGACY_SECTION_MAP[id] || null;
}

export const STUDENT_SETTINGS_ITEMS = [
  {
    id: STUDENT_SETTINGS_SECTIONS.CAMPOS,
    label: 'Campos personalizados',
    hint: 'Turmas e motivos exibidos no cadastro e na gestão do aluno.',
  },
  {
    id: STUDENT_SETTINGS_SECTIONS.GRADUACOES,
    label: 'Graduações',
    hint: 'Opções de faixa ou evolução no perfil do aluno.',
  },
  {
    id: STUDENT_SETTINGS_SECTIONS.MATRICULA,
    label: 'Configurações de matrícula',
    hint: 'Matrícula online e tarefas após a conversão.',
  },
];

export const STUDENT_DEFAULT_SECTION = STUDENT_SETTINGS_SECTIONS.CAMPOS;

export function buildStudentSettingsSummaries({ academy, turmasCount = null, classes = [] }) {
  const reasons = parseStudentExitReasons(academy?.studentExitReasons);
  const freezeReasons = parseStudentFreezeReasons(academy?.studentFreezeReasons);
  const enrollment = readPublicEnrollment(academy?.settings);
  const belts = parseBeltGradesFromSettings(academy?.settings);

  const turmas =
    turmasCount != null
      ? turmasCount
      : resolveAcademyTurmaLabels({ settingsRaw: academy?.settings, classes }).length;

  return {
    [STUDENT_SETTINGS_SECTIONS.CAMPOS]: {
      summary:
        turmas === 0 && reasons.length === 0
          ? 'Não configurado'
          : `${turmas} turma${turmas === 1 ? '' : 's'} · ${reasons.length + freezeReasons.length} motivos`,
      done: turmas > 0 || reasons.length > 0,
    },
    [STUDENT_SETTINGS_SECTIONS.GRADUACOES]: {
      summary: belts.length === 0 ? 'Padrão do sistema' : `${belts.length} opções`,
      done: belts.length > 0,
    },
    [STUDENT_SETTINGS_SECTIONS.MATRICULA]: {
      summary: enrollment.enabled ? 'Matrícula online ativa' : 'Somente interna',
      done: enrollment.enabled,
    },
  };
}
