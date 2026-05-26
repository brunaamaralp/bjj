/** Exporta plano de contas para CSV (UTF-8 BOM), mesmo padrão de ReportsTab. */
export function exportAccountsCsv(accounts) {
  const headers = [
    'Código',
    'Nome',
    'Tipo',
    'Natureza',
    'Grupo DRE',
    'Classe DFC',
    'Subcl. DFC',
    'Caixa',
  ];
  const rows = (Array.isArray(accounts) ? [...accounts] : [])
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR'))
    .map((a) => [
      a.code,
      a.name,
      a.type,
      a.nature,
      a.dreGrupo,
      a.dfcClasse,
      a.dfcSubclasse,
      a.cash ? 'Sim' : 'Não',
    ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `plano-de-contas-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
