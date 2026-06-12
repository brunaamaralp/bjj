/** Abre o modal global de Novo Lead (sem navegação). */
export const OPEN_NEW_LEAD_MODAL_EVENT = 'navi:open-new-lead-modal';

export function dispatchOpenNewLeadModal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_NEW_LEAD_MODAL_EVENT));
}
