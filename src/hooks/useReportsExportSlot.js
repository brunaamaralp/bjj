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
  handlerRef.current = config?.onExport;

  useEffect(() => {
    if (!ctx || !config) return undefined;
    ctx.register({
      disabled: Boolean(config.disabled),
      loading: Boolean(config.loading),
      title: config.title || 'Exportar CSV',
      onExport: () => handlerRef.current?.(),
    });
    return () => ctx.unregister();
  }, [ctx, config?.disabled, config?.loading, config?.title]);
}
