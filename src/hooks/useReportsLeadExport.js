import { useCallback, useMemo } from 'react';
import { downloadCsv, leadToCsvRow } from '../lib/reportsExport.js';

export function useReportsLeadExport({ reportData, rangeSlug, isOwner, loading, error }) {
  const reportHasActivity = useMemo(() => {
    if (!reportData?.metrics) return false;
    return Object.values(reportData.metrics).some((m) => m && Number(m.current ?? 0) > 0);
  }, [reportData]);

  const exportDisabled = !reportData || loading || !reportHasActivity || Boolean(error);
  const exportTitle = error
    ? 'Corrija o carregamento do relatório antes de exportar.'
    : !reportData || loading
      ? 'Aguarde o carregamento dos dados'
      : !reportHasActivity
        ? 'Sem dados para exportar neste período'
        : 'Exportar relatório em CSV';

  const exportList = useCallback(
    (listKey, slug, onDone) => {
      if (!reportData || !reportData.metrics[listKey]) return;
      const list = reportData.metrics[listKey].list || [];
      const rows = list.map((l) => leadToCsvRow(l, { includeContact: isOwner }));
      if (rows.length === 0) {
        downloadCsv([{ mensagem: 'Nenhum registro no período com os filtros atuais' }], `relatorio-${slug}-vazio.csv`);
      } else {
        downloadCsv(rows, `relatorio-${slug}-${rangeSlug}.csv`);
      }
      onDone?.();
    },
    [reportData, rangeSlug, isOwner]
  );

  return { reportHasActivity, exportDisabled, exportTitle, exportList };
}
