export function downloadCsv(rows, filename) {
  const header = Object.keys(rows[0] || {});
  const csv = [
    header.join(';'),
    ...rows.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
