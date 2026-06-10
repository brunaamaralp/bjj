import { useEffect } from 'react';
import { useNlCommandStore } from '../store/useNlCommandStore.js';

/**
 * Registra dados NL específicos da página enquanto ela está montada.
 * @param {object | null | undefined} overrides
 * @param {string | null} [overrides.context]
 * @param {object[]} [overrides.pipelineStages]
 * @param {object[]} [overrides.pendingTransactions]
 * @param {object[]} [overrides.recentPayments]
 */
export function useNlPageContext(overrides) {
  const setPageOverrides = useNlCommandStore((s) => s.setPageOverrides);
  const clearPageOverrides = useNlCommandStore((s) => s.clearPageOverrides);

  useEffect(() => {
    if (overrides) setPageOverrides(overrides);
    return () => clearPageOverrides();
  }, [overrides, setPageOverrides, clearPageOverrides]);
}
