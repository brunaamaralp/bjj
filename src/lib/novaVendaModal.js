/** Abre o modal global de Nova Venda (sem navegação). */
export const OPEN_NOVA_VENDA_MODAL_EVENT = 'navi:open-nova-venda-modal';

export function dispatchOpenNovaVendaModal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_NOVA_VENDA_MODAL_EVENT));
}
