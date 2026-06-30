import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ReportsExportSlotContext = createContext(null);

export function ReportsExportSlotProvider({ children }) {
  const [slot, setSlot] = useState(null);
  const register = useCallback((config) => setSlot(config), []);
  const unregister = useCallback(() => setSlot(null), []);
  const value = useMemo(() => ({ slot, register, unregister }), [slot, register, unregister]);
  return (
    <ReportsExportSlotContext.Provider value={value}>{children}</ReportsExportSlotContext.Provider>
  );
}

export function useReportsExportSlot() {
  return useContext(ReportsExportSlotContext);
}

/**
 * Registra exportação CSV da aba ativa na toolbar global.
 * @param {null | {
 *   disabled?: boolean,
 *   loading?: boolean,
 *   title?: string,
 *   onExport?: () => void,
 * }} config
 */
export function useRegisterReportsExport(config) {
  const ctx = useReportsExportSlot();
  const handlerRef = useRef(config?.onExport);

  useEffect(() => {
    handlerRef.current = config?.onExport;
  }, [config?.onExport]);

  // Extrair as funções estáveis do contexto para evitar que `ctx` (objeto
  // inteiro) entre nos deps: cada ctx.register() troca `slot` → novo `ctx`
  // → effect re-dispara → loop infinito. register/unregister são useCallback
  // com deps [], então nunca mudam de referência.
  const register = ctx?.register;
  const unregister = ctx?.unregister;

  useEffect(() => {
    if (!register || !config) return undefined;
    register({
      disabled: Boolean(config.disabled),
      loading: Boolean(config.loading),
      title: config.title || 'Exportar CSV',
      onExport: () => handlerRef.current?.(),
    });
    return () => unregister?.();
  }, [register, unregister, config?.disabled, config?.loading, config?.title]);
}
