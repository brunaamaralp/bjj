import { useUiStore } from '../store/useUiStore.js';

/** Abre o modal global de Novo Lead (sem navegação). */
export const OPEN_NEW_LEAD_MODAL_EVENT = 'navi:open-new-lead-modal';

let preloadPromise = null;

export function preloadNewLeadModalChunk() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!preloadPromise) {
    preloadPromise = import('../components/leads/NewLeadModal.jsx').catch((err) => {
      preloadPromise = null;
      throw err;
    });
  }
  return preloadPromise;
}

export function dispatchOpenNewLeadModal() {
  if (typeof window === 'undefined') return;
  void preloadNewLeadModalChunk();
  useUiStore.getState().openNewLeadModal();
  window.dispatchEvent(new CustomEvent(OPEN_NEW_LEAD_MODAL_EVENT));
}
