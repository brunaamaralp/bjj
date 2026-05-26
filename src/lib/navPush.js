/** Evento global para navegação SPA a partir de módulos sem acesso ao React Router. */
export const NAV_PUSH_EVENT = 'nav:push';

/**
 * @param {string} path — path + query, ex. `/conta?tab=assinatura`
 */
export function dispatchNavPush(path) {
  const target = String(path || '').trim();
  if (!target || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_PUSH_EVENT, { detail: target }));
}
