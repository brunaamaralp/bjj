import { useMemo } from 'react';
import {
  AUTOMATION_DEFAULTS,
  parseAutomationsConfig as parseAutomationsConfigCore,
  recommendedTemplateKeyForAutomation,
} from '../../lib/automationCore.js';

export { AUTOMATION_DEFAULTS };

export const AUTOMATION_LABELS = {
  schedule_confirm: {
    label: 'Agendamento confirmado',
    description: 'Enviada imediatamente ao confirmar a aula experimental.',
    triggerWhere: 'Funil → ao confirmar agendamento',
  },
  presence_confirmed: {
    label: 'Presença confirmada',
    description: 'Enviada após confirmar que o lead compareceu.',
    triggerWhere: 'Funil → ao marcar presença',
  },
  missed: {
    label: 'Não compareceu',
    description: 'Enviada imediatamente ao registrar falta.',
    triggerWhere: 'Funil → ao registrar falta',
  },
  waiting_decision: {
    label: 'Aguardando decisão',
    description: 'Enviada após o contato entrar na etapa «Aguardando decisão».',
    triggerWhere: 'Funil → etapa Aguardando decisão',
  },
  followup_d1_attended: {
    label: 'Retorno no dia seguinte (compareceu)',
    description: 'No dia seguinte à experimental, se ainda não houve contato de retorno.',
    triggerWhere: 'Cron diário → dia seguinte à aula',
  },
  converted: {
    label: 'Matrícula realizada',
    description: 'Boas-vindas enviadas imediatamente após matricular.',
    triggerWhere: 'Matrícula → ao converter lead em aluno',
  },
  schedule_reminder: {
    label: 'Lembrete de aula',
    description: 'Enviado automaticamente antes da aula agendada.',
    triggerWhere: 'Cron → antes do horário da aula',
  },
  birthday: {
    label: 'Aniversário do aluno',
    description: 'Enviada automaticamente no dia do aniversário de cada aluno matriculado.',
    triggerWhere: 'Cron diário → ~9h (horário de Brasília)',
  },
};

export const AUTOMATION_GROUP_HINTS = {
  captacao: 'Mensagens ligadas ao funil de leads e aulas experimentais.',
  posMatricula: 'Mensagem de boas-vindas após a matrícula.',
  rotinas: 'Envios automáticos por data, sem ação manual no funil.',
};

/** Eventos de funil / WhatsApp vs pós-matrícula (UI em Empresa → Automações). */
export const AUTOMATION_GROUPS = {
  captacao: [
    'schedule_confirm',
    'presence_confirmed',
    'missed',
    'followup_d1_attended',
    'waiting_decision',
    'schedule_reminder',
  ],
  posMatricula: ['converted'],
  rotinas: ['birthday'],
};

export const AUTOMATION_DELAY_OPTIONS = {
  schedule_reminder: [
    { value: 120, label: '2 horas antes' },
    { value: 240, label: '4 horas antes' },
    { value: 1440, label: '24 horas antes' },
  ],
  waiting_decision: [
    { value: 720, label: '12 horas depois' },
    { value: 1440, label: '1 dia depois' },
    { value: 2880, label: '2 dias depois' },
    { value: 4320, label: '3 dias depois' },
  ],
};

export function serializeAutomationsConfig(cfg) {
  return JSON.stringify(parseAutomationsConfig(cfg));
}

export function parseAutomationsConfig(raw) {
  return parseAutomationsConfigCore(raw);
}

export function useAutomations(raw) {
  return useMemo(() => parseAutomationsConfig(raw), [raw]);
}

/**
 * Ordena modelos com o recomendado primeiro e marca na label.
 * @param {string} automationKey
 * @param {{ id: string; label: string }[]} templateOptions
 */
export function templateOptionsForAutomation(automationKey, templateOptions) {
  const recommended = recommendedTemplateKeyForAutomation(automationKey);
  const list = Array.isArray(templateOptions) ? [...templateOptions] : [];
  list.sort((a, b) => {
    if (a.id === recommended) return -1;
    if (b.id === recommended) return 1;
    return String(a.label || a.id).localeCompare(String(b.label || b.id), 'pt-BR');
  });
  return list.map((opt) => ({
    ...opt,
    recommended: opt.id === recommended,
    label:
      opt.id === recommended && recommended
        ? `${opt.label} (recomendado)`
        : opt.label,
  }));
}

export { recommendedTemplateKeyForAutomation };
