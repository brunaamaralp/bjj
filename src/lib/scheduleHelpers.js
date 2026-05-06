import { LEAD_STATUS } from './leadStatus.js';

/** Status que não devem ser revertidos para Agendado ao só mudar data/hora. */
const ADVANCED_STATUSES = [
  LEAD_STATUS.CONVERTED,
  LEAD_STATUS.LOST,
];

/**
 * Patch para agendar/reagendar via ScheduleModal.
 * Primeira vez (sem scheduledDate): sempre Agendado + Aula experimental.
 * Reagendamento de Compareceu/Não Compareceu: volta para Agendado (retorna para agenda).
 * Reagendamento com status terminal (Matriculado/Não fechou): só datas + statusChangedAt.
 *
 * @param {object} lead
 * @param {{ date: string; time: string }} param1
 */
export function buildSchedulePatch(lead, { date, time }) {
  const hadDate = String(lead?.scheduledDate || '').trim();
  const isReschedule = Boolean(hadDate);
  const isAdvanced = ADVANCED_STATUSES.includes(lead?.status);

  return {
    scheduledDate: date,
    scheduledTime: time,
    statusChangedAt: new Date().toISOString(),
    ...(isReschedule && isAdvanced
      ? {}
      : {
          status: LEAD_STATUS.SCHEDULED,
          pipelineStage: 'Aula experimental',
        }),
  };
}
