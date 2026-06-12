import { downloadCsvMatrix } from './reportsExport.js';

/** Exporta plano de contas para CSV (UTF-8 BOM, delimitador ;). */
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
  downloadCsvMatrix(headers, rows, `plano-de-contas-${new Date().toISOString().slice(0, 10)}.csv`);
}
