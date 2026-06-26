import { shouldMirrorPaymentToCaixa } from './paymentStatus.js';

const FINANCEIRO_TX_PATH = '/financeiro?tab=movimentacoes';

/** Badge/link Caixa para pagamento do aluno (nunca para status covered). */
export function paymentCaixaMeta(payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered' || st === 'frozen') return null;
  if (!shouldMirrorPaymentToCaixa(st)) return null;

  if (payment?.financial_tx_sync_pending) {
    return { label: 'Caixa pendente', tone: 'warning', href: null };
  }

  const txId = String(payment?.financial_tx_id || '').trim();
  if (!txId) return null;

  const label =
    st === 'pending' || st === 'awaiting' ? 'A receber no Caixa' : 'No Caixa';

  return {
    label,
    tone: st === 'pending' || st === 'awaiting' ? 'warning' : 'success',
    href: `${FINANCEIRO_TX_PATH}&tx=${encodeURIComponent(txId)}`,
  };
}

/** Badge/link Caixa para venda de produto vinculada ao aluno. */
export function saleCaixaMeta(sale) {
  const st = String(sale?.status || '').toLowerCase();
  if (st === 'cancelada') return null;

  const txId = String(sale?.financial_tx_id || '').trim();
  if (txId) {
    return {
      label: st === 'pendente' ? 'A receber no Caixa' : 'No Caixa',
      tone: st === 'pendente' ? 'warning' : 'success',
      href: `${FINANCEIRO_TX_PATH}&tx=${encodeURIComponent(txId)}`,
    };
  }

  const shortId = String(sale?.id_short || sale?.id || '').trim();
  if (!shortId) return null;

  return {
    label: st === 'pendente' ? 'A receber no Caixa' : 'No Caixa',
    tone: st === 'pendente' ? 'warning' : 'success',
    href: `${FINANCEIRO_TX_PATH}&q=${encodeURIComponent(shortId)}`,
  };
}
