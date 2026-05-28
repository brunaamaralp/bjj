import { useCallback, useMemo } from 'react';
import { useUiStore } from '../store/useUiStore';
import { friendlyError, friendlySaleError } from '../lib/errorMessages';

/**
 * API de toasts com mensagens amigáveis em erros de API.
 */
export function useToast() {
  const addToast = useUiStore((s) => s.addToast);

  const show = useCallback((toast) => addToast(toast), [addToast]);

  const success = useCallback((message, opts = {}) => addToast({ type: 'success', message, ...opts }), [addToast]);

  const info = useCallback((message, opts = {}) => addToast({ type: 'info', message, ...opts }), [addToast]);

  const warning = useCallback((message, opts = {}) => addToast({ type: 'warning', message, ...opts }), [addToast]);

  const error = useCallback(
    (errOrMessage, context = 'action', opts = {}) => {
      const message =
        typeof errOrMessage === 'string'
          ? errOrMessage
          : friendlyError(errOrMessage, context);
      return addToast({ type: 'error', message, ...opts });
    },
    [addToast]
  );

  const saleError = useCallback(
    (err, opts = {}) => {
      const message = friendlySaleError(err) || friendlyError(err, 'action');
      return addToast({ type: 'error', message, ...opts });
    },
    [addToast]
  );

  return useMemo(
    () => ({ show, success, info, warning, error, saleError, addToast }),
    [show, success, info, warning, error, saleError, addToast]
  );
}
