/**
 * Exporta leads/alunos para planilha .xlsx (Funil, Empresa → Avançado).
 */

/** @param {object} l @param {{ includeContact?: boolean }} [opts] */
export function leadToSpreadsheetRow(l, { includeContact = true } = {}) {
  const row = {
    Nome: l.name || '',
    Tipo: l.type || '',
    Origem: l.origin || '',
    Status: l.status || '',
    Responsável: l.parentName || '',
    Plano: l.plan || '',
    'Data Aula': l.scheduledDate || '',
    Horário: l.scheduledTime || '',
    'Criado em': l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '',
  };
  if (includeContact) {
    row.Telefone = l.phone || '';
  }
  return row;
}

/**
 * @param {object[]} leads
 * @param {string} [fileName]
 * @param {{ includeContact?: boolean }} [opts]
 */
export async function exportLeadsSpreadsheet(leads, fileName = 'bjj-crm-export', opts = {}) {
  if (!leads?.length) return false;

  const XLSX = await import('xlsx');
  const includeContact = opts.includeContact !== false;

  const data = leads.map((l) => leadToSpreadsheetRow(l, { includeContact }));

  const ws = XLSX.utils.json_to_sheet(data);
  const colWidths = Object.keys(data[0]).map((key) => ({
    wch: Math.max(key.length, ...data.map((row) => String(row[key] || '').length)) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
  return true;
}

/**
 * Busca todos os leads da academia e gera planilha.
 * @param {string} academyId
 * @param {string} fileName
 * @param {{ includeContact?: boolean, onProgress?: (n: number, total?: number) => void }} [opts]
 */
export async function exportAllLeadsSpreadsheet(academyId, fileName, opts = {}) {
  const { fetchAllLeadsPaginated } = await import('./fetchAllLeadsPaginated.js');
  const leads = await fetchAllLeadsPaginated(academyId, opts.onProgress);
  if (!leads.length) return { ok: false, count: 0 };
  const ok = await exportLeadsSpreadsheet(leads, fileName, {
    includeContact: opts.includeContact,
  });
  return { ok, count: leads.length };
}
