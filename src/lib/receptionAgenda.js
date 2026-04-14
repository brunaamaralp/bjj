/** Regras da agenda da recepção (Dashboard) — funções puras para testes e reuso. */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function hasExperimentalDate(lead) {
  const ymd = String(lead?.scheduledDate || '').trim().split('T')[0];
  return YMD.test(ymd);
}

export function excludeImportedOrigin(lead) {
  return String(lead?.origin || '').trim() !== 'Planilha';
}

/** Status operacional "Agendado" (LEAD_STATUS.SCHEDULED). */
export function isScheduledStatus(lead, scheduledLabel = 'Agendado') {
  return String(lead?.status || '').trim() === scheduledLabel;
}

/**
 * Lead elegível antes dos filtros de exclusão (matriculado / aluno).
 */
export function isReceptionAgendaBaseCandidate(lead, scheduledLabel = 'Agendado') {
  return (
    excludeImportedOrigin(lead) &&
    isScheduledStatus(lead, scheduledLabel) &&
    hasExperimentalDate(lead)
  );
}

/**
 * Remove matriculados/alunos da lista já filtrada por agendamento.
 */
export function passesReceptionAgendaExclusions(lead, convertedStatus = 'Matriculado') {
  if (String(lead?.status || '').trim() === convertedStatus) return false;
  if (String(lead?.pipelineStage || '').trim() === 'Matriculado') return false;
  if (String(lead?.contact_type || '').trim() === 'student') return false;
  return true;
}

export function isReceptionAgendaLead(lead, scheduledLabel = 'Agendado', convertedStatus = 'Matriculado') {
  return isReceptionAgendaBaseCandidate(lead, scheduledLabel) && passesReceptionAgendaExclusions(lead, convertedStatus);
}
