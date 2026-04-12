import { useUiStore } from '../store/useUiStore';

/**
 * Se a resposta for 402 (billing), mostra toast e redireciona para /planos.
 * @param {Response} res
 * @returns {Promise<boolean>} true se o fluxo deve parar (billing bloqueado)
 */
export async function consumeBillingBlockedResponse(res) {
  if (res.status !== 402) return false;
  let data = {};
  try {
    data = await res.json();
  } catch {
    void 0;
  }
  const message =
    data.message || data.erro || data.error || 'Assinatura necessária para continuar.';
  try {
    useUiStore.getState().addToast({
      type: 'warning',
      message: String(message),
      duration: 4500,
    });
  } catch {
    void 0;
  }
  setTimeout(() => {
    if (typeof window !== 'undefined') window.location.assign('/planos');
  }, 2000);
  return true;
}

/**
 * fetch + bloqueio de billing (402).
 * @returns {Promise<{ blocked: boolean, res: Response | null }>}
 */
export async function fetchWithBillingGuard(url, init) {
  const res = await fetch(url, init);
  if (await consumeBillingBlockedResponse(res)) {
    return { blocked: true, res: null };
  }
  return { blocked: false, res };
}
