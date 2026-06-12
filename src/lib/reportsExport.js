/** Delimitador padrão BR para CSV (Excel pt-BR). */
export const CSV_DELIMITER = ';';

export function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * @param {string[]} headers
 * @param {unknown[][]} matrixRows
 */
export function buildCsvContent(headers, matrixRows) {
  const lines = [
    headers.map(escapeCsvCell).join(CSV_DELIMITER),
    ...matrixRows.map((row) => row.map(escapeCsvCell).join(CSV_DELIMITER)),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

/**
 * @param {string[]} headers
 * @param {unknown[][]} matrixRows
 * @param {string} filename
 */
export function downloadCsvMatrix(headers, matrixRows, filename) {
  const blob = new Blob([buildCsvContent(headers, matrixRows)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** @param {Record<string, unknown>[]} rows */
export function downloadCsv(rows, filename) {
  const header = Object.keys(rows[0] || {});
  const matrixRows = rows.map((r) => header.map((h) => r[h]));
  downloadCsvMatrix(header, matrixRows, filename);
}

/** @param {string[]} headers @param {unknown[][]} sampleRows @param {string} filename */
export function downloadCsvTemplate(headers, sampleRows, filename) {
  downloadCsvMatrix(headers, sampleRows, filename);
}

/** Exporta relatório por operador (aba Por Operador). */
export function exportOperatorReport(operators, periodLabel) {
  const rows = (operators || []).map((o) => ({
    operador: o.operador_nome || '',
    vendas: o.vendas_concluidas ?? 0,
    faturamento: o.faturamento ?? 0,
    ticket_medio: o.ticket_medio ?? 0,
    cancelamentos: o.cancelamentos ?? 0,
  }));
  if (!rows.length) {
    downloadCsv([{ mensagem: 'Nenhum operador no período' }], `relatorio-operador-${periodLabel}-vazio.csv`);
    return;
  }
  downloadCsv(rows, `relatorio-operador-${periodLabel}.csv`);
}

export function leadToCsvRow(l, { includeContact = true } = {}) {
  const row = {
    nome: l.name || '',
    tipo: l.type || '',
    origem: l.origin || '',
    status: l.status || '',
    data_aula: l.scheduledDate || '',
    horario: l.scheduledTime || '',
    criado_em: l.createdAt ? new Date(l.createdAt).toISOString() : '',
  };
  if (includeContact) row.telefone = l.phone || '';
  return row;
}
