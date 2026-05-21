import { createSessionJwt } from './appwrite.js';

async function headers(academyId) {
  const jwt = await createSessionJwt();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
}

async function parseJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.detail || 'Erro na conciliação');
  return body;
}

export async function listBankStatements(academyId) {
  const res = await fetch('/api/bank-reconciliation?route=list', {
    headers: await headers(academyId),
  });
  return parseJson(res);
}

export async function getBankStatementDetail(academyId, statementId) {
  const params = new URLSearchParams({ route: 'detail', statement_id: statementId });
  const res = await fetch(`/api/bank-reconciliation?${params}`, {
    headers: await headers(academyId),
  });
  return parseJson(res);
}

export async function importBankStatement(academyId, payload) {
  const res = await fetch('/api/bank-reconciliation?route=import', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function confirmBankMatch(academyId, { item_id, transaction_id }) {
  const res = await fetch('/api/bank-reconciliation?route=confirm-match', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify({ item_id, transaction_id }),
  });
  return parseJson(res);
}

export async function confirmAllBankMatches(academyId, statement_id) {
  const res = await fetch('/api/bank-reconciliation?route=confirm-all', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify({ statement_id }),
  });
  return parseJson(res);
}

export async function ignoreBankItem(academyId, item_id) {
  const res = await fetch('/api/bank-reconciliation?route=ignore-item', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify({ item_id }),
  });
  return parseJson(res);
}

export async function manualReconcileTx(academyId, { transaction_id, statement_id, justification }) {
  const res = await fetch('/api/bank-reconciliation?route=manual-reconcile', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify({ transaction_id, statement_id, justification }),
  });
  return parseJson(res);
}

export async function createTxFromBankItem(academyId, { item_id, category }) {
  const res = await fetch('/api/bank-reconciliation?route=create-tx', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify({ item_id, category }),
  });
  return parseJson(res);
}

export async function completeBankReconciliation(academyId, { statement_id, completion_note }) {
  const res = await fetch('/api/bank-reconciliation?route=complete', {
    method: 'POST',
    headers: await headers(academyId),
    body: JSON.stringify({ statement_id, completion_note }),
  });
  return parseJson(res);
}
