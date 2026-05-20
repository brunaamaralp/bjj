import { useMemo } from 'react';

export const AUTOMATION_DEFAULTS = {
  schedule_confirm: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  presence_confirmed: { active: false, templateKey: 'post_class', delayMinutes: 0 },
  missed: { active: false, templateKey: 'missed', delayMinutes: 0 },
  waiting_decision: { active: false, templateKey: 'recovery', delayMinutes: 1440 },
  converted: { active: false, templateKey: 'confirm', delayMinutes: 0 },
  schedule_reminder: { active: false, templateKey: 'reminder', delayMinutes: 120 },
};

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
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
    return Object.fromEntries(
      Object.entries(AUTOMATION_DEFAULTS).map(([key, defaults]) => [
        key,
        { ...defaults, ...(saved[key] ?? {}) },
      ])
    );
  } catch {
    return Object.fromEntries(
      Object.entries(AUTOMATION_DEFAULTS).map(([key, defaults]) => [key, { ...defaults }])
    );
  }
}

export function useAutomations(raw) {
  return useMemo(() => parseAutomationsConfig(raw), [raw]);
}
