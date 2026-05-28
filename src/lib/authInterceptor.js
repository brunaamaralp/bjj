import { authService } from './auth.js';
import { useUiStore, TOAST_DURATION } from '../store/useUiStore.js';

let sessionExpiredHandling = false;

/**
 * Wrapper de fetch para APIs autenticadas.
 * Em 401: logout, toast e rejeita com session_required.
 */
export async function authedFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    if (!sessionExpiredHandling) {
      sessionExpiredHandling = true;
      try {
        await authService.logout();
        useUiStore.getState().addToast({
          type: 'error',
          message: 'Sua sessão expirou. Faça login novamente.',
          duration: TOAST_DURATION.error,
        });
      } finally {
        sessionExpiredHandling = false;
      }
    }
    throw new Error('session_required');
  }
  return res;
}
