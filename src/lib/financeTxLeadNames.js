/** @param {object} tx @param {Map<string, string>} [leadNameById] */
export function resolveTxLeadId(tx) {
  return String(tx?.lead_id || '').trim();
}

/** Nome do aluno para exibição (API lead_name, store ou fallback). */
export function resolveTxLeadName(tx, leadNameById = new Map()) {
  const id = resolveTxLeadId(tx);
  const fromTx = String(tx?.lead_name || '').trim();
  if (fromTx) return fromTx;
  if (id) {
    const fromMap = String(leadNameById.get(id) || leadNameById.get(tx.lead_id) || '').trim();
    if (fromMap) return fromMap;
    return 'Aluno não encontrado';
  }
  return '';
}

/** Label curto para células (— quando vazio). */
export function formatTxLeadCell(tx, leadNameById = new Map()) {
  const id = resolveTxLeadId(tx);
  if (!id) return '—';
  const name = resolveTxLeadName(tx, leadNameById);
  if (name === 'Aluno não encontrado') return name;
  return name || '—';
}

/** Mapa id → nome mesclando store e lead_name das transações. */
export function buildLeadNameById(transactions, storeLeads = []) {
  const map = new Map();
  for (const l of storeLeads || []) {
    const id = String(l.id || '').trim();
    if (id) map.set(id, String(l.name || '').trim());
  }
  for (const tx of transactions || []) {
    const id = resolveTxLeadId(tx);
    const name = String(tx.lead_name || '').trim();
    if (id && name) map.set(id, name);
  }
  return map;
}

/** @param {object} tx @param {{ leadName?: string, accounts?: object[] }} [ctx] */
export function leadNameForExport(tx, leadNameById = new Map(), ctx = {}) {
  const fromCtx = String(ctx.leadName || '').trim();
  if (fromCtx) return fromCtx;
  const name = resolveTxLeadName(tx, leadNameById);
  return name === 'Aluno não encontrado' ? '' : name;
}
