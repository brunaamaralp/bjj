/**
 * Cancela lançamentos financeiros de uma venda e cria estorno do valor já recebido.
 */
import { Query, ID } from 'node-appwrite';
import { roundMoney } from './salePayments.js';
import { createDocumentResilient } from './appwriteSchemaResilient.js';

export async function cancelSaleFinancials(
  databases,
  { dbId, financialTxCol, vendaId, venda, academyId }
) {
  if (!financialTxCol || !vendaId) {
    return { refund_total: 0 };
  }

  const txList = await databases.listDocuments(dbId, financialTxCol, [
    Query.equal('saleId', vendaId),
    Query.limit(50),
  ]);
  const docs = txList.documents || [];
  const hasRefund = docs.some((d) => {
    const type = String(d.type || '').toLowerCase();
    const origin = String(d.origin_type || '').toLowerCase();
    return type === 'refund' || origin === 'reversal';
  });

  let primarySettledId = null;
  let settledRefundTotal = 0;

  for (const tx of docs) {
    const type = String(tx.type || '').toLowerCase();
    const origin = String(tx.origin_type || '').toLowerCase();
    if (type === 'refund' || origin === 'reversal') continue;
    if (String(tx.status || '').toLowerCase() === 'cancelled') continue;

    const txStatus = String(tx.status || '').toLowerCase();
    if (txStatus === 'settled') {
      settledRefundTotal += roundMoney(Number(tx.net) || Number(tx.gross) || 0);
      if (!primarySettledId) primarySettledId = tx.$id;
    }

    await databases.updateDocument(dbId, financialTxCol, tx.$id, {
      status: 'cancelled',
      settledAt: '',
    });
  }

  settledRefundTotal = roundMoney(settledRefundTotal);
  let refund_total = 0;

  if (settledRefundTotal > 0 && primarySettledId && !hasRefund) {
    const shortId = String(vendaId).slice(-4).toUpperCase();
    const estornoNote = `Estorno venda #${shortId}`;
    const refundSettledAt = new Date().toISOString();
    const refundPayload = {
      academyId: academyId || venda.academyId || '',
      saleId: vendaId,
      method: venda.forma_pagamento || 'pix',
      installments: 1,
      type: 'refund',
      category: 'Cancelamentos',
      competence_month: refundSettledAt.slice(0, 7),
      planName: estornoNote,
      gross: settledRefundTotal,
      fee: 0,
      net: settledRefundTotal,
      direction: 'out',
      status: 'settled',
      settledAt: refundSettledAt,
      note: estornoNote,
      origin_type: 'reversal',
      origin_id: primarySettledId,
      reverses_id: primarySettledId,
    };
    await createDocumentResilient(databases, dbId, financialTxCol, ID.unique(), refundPayload);
    refund_total = settledRefundTotal;
  }

  return { refund_total };
}
