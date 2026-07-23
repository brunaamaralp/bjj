/** Microcopy da recepção (Hoje) — tom acolhedor, orientado à ação. */

export function attendedButtonLabel(vertical) {
  return vertical === 'physio' ? 'Compareceu à avaliação' : 'Veio treinar';
}

export function missedButtonLabel() {
  return 'Não veio';
}

export function attendedButtonShort(vertical) {
  return vertical === 'physio' ? 'Compareceu' : 'Veio';
}

export function attendedStatusLabel(vertical) {
  return vertical === 'physio' ? 'Compareceu à avaliação' : 'Veio';
}

export function missedStatusLabel() {
  return 'Não veio';
}

export function followupsAllDoneTitle() {
  return 'Follow-ups em dia. A recepção mandou bem.';
}

export function followupSectionTitle() {
  return 'Follow-ups pendentes';
}

export function followupKpiLabel() {
  return followupSectionTitle();
}

/** Chip mobile e aria-label de badge na aba Experimentais. */
export function followupPendingCountLabel(count) {
  const n = Number(count) || 0;
  return `${n} follow-up${n === 1 ? '' : 's'} pendente${n === 1 ? '' : 's'}`;
}

export function followupEmptyHint() {
  return 'Quando alguém comparecer ou faltar, os follow-ups aparecem aqui.';
}

export function followupCompleteActionLabel() {
  return 'Concluir follow-up';
}

export function receptionDaySubtitle() {
  return receptionCommercialSubtitle();
}

export function receptionCommercialSubtitle() {
  return 'Experimentais, follow-ups e conversão';
}

export function receptionPresenceSubtitle() {
  return 'Entradas ao vivo e retenção por frequência';
}

export function toastAttendedSuccess(isFirstOfDay) {
  if (isFirstOfDay) return 'Primeira presença do dia — ótimo começo!';
  return 'Presença registrada — ótimo trabalho!';
}

export function toastMissedSuccess() {
  return 'Não compareceu registrado.';
}

export function undoPresenceLabel() {
  return 'Desfazer';
}

export function toastPresenceUndoSuccess() {
  return 'Registro desfeito — experimental voltou para agendada.';
}

export function followupMicroToastMessage() {
  return 'Retorno registrado!';
}

export function followupStreakMessage(streak) {
  const n = Number(streak) || 0;
  if (n < 2) return '';
  return `${n}º dia seguido com follow-ups em dia.`;
}

export function weeklyEnrollmentsLine(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n === 1) return '1 matrícula esta semana. Continue assim.';
  return `${n} matrículas esta semana. Continue assim.`;
}
