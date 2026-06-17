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
  return vertical === 'physio' ? 'Compareceu à avaliação' : 'Compareceu';
}

export function missedStatusLabel() {
  return 'Não veio';
}

export function followupsAllDoneTitle() {
  return 'Retornos em dia. A recepção mandou bem.';
}

export function followupKpiLabel() {
  return 'Follow-ups pendentes';
}

export function toastAttendedSuccess(isFirstOfDay) {
  if (isFirstOfDay) return 'Primeira presença do dia — ótimo começo!';
  return 'Presença registrada — ótimo trabalho!';
}

export function toastMissedSuccess() {
  return 'Não compareceu registrado.';
}

export function followupMicroToastMessage() {
  return 'Retorno registrado!';
}

export function followupStreakMessage(streak) {
  const n = Number(streak) || 0;
  if (n < 2) return '';
  return `${n}º dia seguido com retornos em dia.`;
}

export function weeklyEnrollmentsLine(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n === 1) return '1 matrícula esta semana. Continue assim.';
  return `${n} matrículas esta semana. Continue assim.`;
}
