/**
 * Exporta leads/alunos para planilha .xlsx (uso em ExportButton e Empresa → Avançado).
 */
export async function exportLeadsSpreadsheet(leads, fileName = 'bjj-crm-export') {
  if (!leads?.length) return false;

  const XLSX = await import('xlsx');

  const data = leads.map((l) => ({
    Nome: l.name || '',
    Telefone: l.phone || '',
    Tipo: l.type || '',
    Origem: l.origin || '',
    Status: l.status || '',
    'Data Aula': l.scheduledDate || '',
    Horário: l.scheduledTime || '',
    'Criado em': l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '',
  }));

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
