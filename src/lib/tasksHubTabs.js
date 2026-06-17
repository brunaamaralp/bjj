/** Abas do hub /tarefas?tab= */
export const TASKS_HUB_TABS = [
  { id: 'operacao', label: 'Operação', shortLabel: 'Operação' },
  { id: 'processos', label: 'Processos da equipe', shortLabel: 'Processos' },
];

export const TASKS_TAB_OPERACAO = 'operacao';
export const TASKS_TAB_PROCESSOS = 'processos';

/** @param {string | null | undefined} tab */
export function resolveTasksHubTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (t === TASKS_TAB_PROCESSOS) return TASKS_TAB_PROCESSOS;
  return TASKS_TAB_OPERACAO;
}

export function isTasksProcessosTab(tab) {
  return resolveTasksHubTab(tab) === TASKS_TAB_PROCESSOS;
}
