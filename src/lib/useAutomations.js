import { useMemo } from 'react';
import {
  AUTOMATION_DEFAULTS,
  parseAutomationsConfig as parseAutomationsConfigCore,
} from '../../lib/automationCore.js';

export { AUTOMATION_DEFAULTS };

export const AUTOMATION_LABELS = {
  schedule_confirm: {
    label: 'Agendamento confirmado',
    description: 'Enviada imediatamente ao confirmar a aula experimental.',
  },
  presence_confirmed: {
    label: 'Presença confirmada',
    description: 'Enviada após confirmar que o lead compareceu.',
  },
  missed: {
    label: 'Não compareceu',
    description: 'Enviada imediatamente ao registrar falta.',
  },
  waiting_decision: {
    label: 'Aguardando decisão',
    description: 'Enviada após o contato entrar na etapa «Aguardando decisão».',
  },
  followup_d1_attended: {
    label: 'Retorno no dia seguinte (compareceu)',
    description: 'No dia seguinte à experimental, se ainda não houve contato de retorno.',
  },
  converted: {
    label: 'Matrícula realizada',
    description: 'Boas-vindas enviadas imediatamente após matricular.',
  },
  schedule_reminder: {
    label: 'Lembrete de aula',
    description: 'Enviado automaticamente antes da aula agendada.',
  },
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
