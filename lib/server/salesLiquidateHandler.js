/**
 * PATCH /api/sales — liquida venda pendente (a prazo) ou saldo de venda parcial.
 */
import { Query } from 'node-appwrite';
import {
  ensureAuth,
  ensureAcademyAccess,
  databases,
  DB_ID,
} from './academyAccess.js';
import {
  normalizePagamentosInput,
  validatePagamentosAgainstTotal,
  buildFormaPagamentoResumo,
  roundMoney,
  resolveSaleLiquidationContext,
} from './salePayments.js';
import { recordFinancialAudit } from './financialAuditLog.js';
import { mirrorMixedPayments, isSaleBalancePendingTx } from './salesMirror.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { financialTxSettlementFields } from '../../src/lib/paymentSettlement.js';
import { mirrorAmountsForPaymentWithAccount } from '../../src/lib/resolveAcquirerFees.js';
import { parseFinanceConfig } from './financeTxFields.js';
import { resolveBankAccountForPayment } from '../../src/lib/bankAccounts.js';
import {
  resolveSaleMirrorBankAccountForPayment,
  validateAndNormalizeSalePayments,
} from './salePaymentRules.js';
const SALES_COL = process.env.SALES_COL || process.env.VITE_APPWRITE_SALES_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COL_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

async function loadFinanceConfig(academyId) {
  if (!ACADEMIES_COL || !academyId) return { bankAccounts: [] };
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    return parseFinanceConfig(doc.financeConfig);
  } catch {
    return { bankAccounts: [] };
  }
}

function json(res, status, body) {
  res.status(status).json(body);
}

async function listSaleFinancialTx(vendaId) {
  if (!FINANCIAL_TX_COL || !vendaId) return [];
  try {
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
      Query.equal('saleId', vendaId),
      Query.limit(25),
    ]);
    return res.documents || [];
  } catch {
    return [];
  }
}

function saleDescriptionFromSnapshot(saleDoc) {
  let description = 'Venda de produtos';
  try {
    const snap = JSON.parse(saleDoc.itens_snapshot_json || '[]');
    if (Array.isArray(snap) && snap.length) {
      description =
        snap
          .map((l) => (Number(l.quantidade) > 1 ? `${l.label} x${l.quantidade}` : l.label))
          .join(', ') || description;
    }
  } catch {
    void 0;
  }
  return description;
}

async function cancelPendingTxs(txs) {
  for (const tx of txs) {
    try {
      await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tx.$id, {
        status: 'cancelled',
        settledAt: '',
      });
    } catch {
      void 0;
    }
  }
}

async function settleSinglePendingTx({ tx, pagamento, financeConfig, academyId, settledAt }) {
  const p = pagamento;
  const gross = roundMoney(p.valor);
  const bankAccount = resolveSaleMirrorBankAccountForPayment(
    financeConfig,
    p,
    resolveBankAccountForPayment('', financeConfig)
  );
  const installments = Math.min(12, Math.max(1, Number(p.installments) || 1));
  const { fee, net } = mirrorAmountsForPaymentWithAccount({
    gross,
    policy: financeConfig?.acquirerFeePolicy,
    method: p.forma,
    installments,
    financeConfig,
    captureMethodId: p.capture_method_id || '',
    bankAccount: bankAccount || '',
  });
  const settlement = financialTxSettlementFields({
    financeConfig,
    method: p.forma,
    paidAt: settledAt,
    installments,
    captureMethodId: p.capture_method_id || '',
  });
  try {
    const updated = await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tx.$id, {
      status: settlement.status,
      settledAt: settlement.settledAt || '',
      expected_settlement_at: settlement.expected_settlement_at,
      method: p.forma,
      installments,
      gross,
      fee,
      net,
      capture_method_id: p.capture_method_id || '',
      bank_account: bankAccount || '',
    });
    if (updated && String(updated.status || '').toLowerCase() === 'settled') {
      void applyAccountingSideEffectsAutoServer(
        {
          id: updated.$id,
          type: updated.type,
          category: updated.category,
          gross: updated.gross,
          fee: updated.fee,
          net: updated.net,
          status: updated.status,
          settledAt: updated.settledAt,
          competence_month: updated.competence_month,
          planName: updated.planName,
          note: updated.note,
        },
        academyId
      );
    }
  } catch (e) {
    console.warn('[salesLiquidate] tx settle', e?.message);
  }
}

export default async function salesLiquidateHandler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!SALES_COL || !DB_ID) {
    return json(res, 503, { ok: false, error: 'sales_not_configured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;
  const userId = me.$id;

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_json' });
    }
  }

  const vendaId = String(body?.id || body?.venda_id || '').trim();
  const action = String(body?.action || '').trim().toLowerCase();
  if (!vendaId || action !== 'liquidar') {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  const bodyAid = String(body.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  let saleDoc;
  try {
    saleDoc = await databases.getDocument(DB_ID, SALES_COL, vendaId);
  } catch {
    return json(res, 404, { ok: false, error: 'not_found' });
  }

  if (saleDoc.academyId && String(saleDoc.academyId) !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const status = String(saleDoc.status || '').trim().toLowerCase();
  if (status !== 'pendente' && status !== 'parcial') {
    return json(res, 409, { ok: false, error: 'sale_not_pending' });
  }

  const liquidation = resolveSaleLiquidationContext(saleDoc);
  const { isPartialSale, balanceDue, paidSoFar: paidSoFarDerived, saleTotal: totalRounded } =
    liquidation;
  const paidSoFar = paidSoFarDerived;

  const pagamentosNorm = normalizePagamentosInput(body.pagamentos);
  if (!pagamentosNorm.length) {
    return json(res, 400, { ok: false, error: 'invalid_pagamentos' });
  }
  const financeConfig = await loadFinanceConfig(academyId);
  const paymentRules = validateAndNormalizeSalePayments(financeConfig, pagamentosNorm);
  if (!paymentRules.ok) {
    return json(res, 400, { ok: false, ...paymentRules });
  }
  pagamentosNorm.splice(0, pagamentosNorm.length, ...paymentRules.payments);

  const check = validatePagamentosAgainstTotal(
    pagamentosNorm,
    balanceDue,
    isPartialSale ? { partial: false } : { deferred: false }
  );
  if (!check.ok) {
    return json(res, 400, {
      ok: false,
      error: 'pagamentos_total_mismatch',
      expected: balanceDue,
      received: check.net,
    });
  }
  if (check.net > balanceDue + 0.009) {
    return json(res, 400, {
      ok: false,
      error: 'pagamentos_exceed_balance',
      expected: balanceDue,
      received: check.net,
    });
  }

  let priorPagamentos = [];
  if (isPartialSale && saleDoc.pagamentos_json) {
    try {
      priorPagamentos = normalizePagamentosInput(JSON.parse(saleDoc.pagamentos_json));
    } catch {
      priorPagamentos = [];
    }
  }
  const mergedPagamentos = isPartialSale ? [...priorPagamentos, ...pagamentosNorm] : pagamentosNorm;
  const formaFinal = buildFormaPagamentoResumo(mergedPagamentos);
  const pagamentosJson = JSON.stringify(mergedPagamentos);
  if (pagamentosJson.length > 1024) {
    return json(res, 400, { ok: false, error: 'pagamentos_json_too_large' });
  }

  const settledAt = new Date().toISOString();
  const allTxs = await listSaleFinancialTx(vendaId);
  const pendingTxs = allTxs.filter((d) => String(d.status || '').toLowerCase() === 'pending');
  const balancePendingTxs = isPartialSale
    ? pendingTxs.filter((tx) => isSaleBalancePendingTx(tx))
    : pendingTxs;

  const salePatch = {
    status: 'concluida',
    forma_pagamento: formaFinal,
    pagamentos_json: pagamentosJson,
    paid_amount: totalRounded,
  };

  try {
    await databases.updateDocument(DB_ID, SALES_COL, vendaId, salePatch);
  } catch (e) {
    const msg = String(e?.message || '');
    const next = {
      status: 'concluida',
      forma_pagamento: formaFinal,
      paid_amount: totalRounded,
    };
    if (!msg.includes('pagamentos_json')) next.pagamentos_json = pagamentosJson;
    try {
      await databases.updateDocument(DB_ID, SALES_COL, vendaId, next);
    } catch (e2) {
      console.error('[salesLiquidate] sale patch', e2?.message || e2);
      return json(res, 500, { ok: false, error: 'update_failed' });
    }
  }

  if (FINANCIAL_TX_COL) {
    if (isPartialSale) {
      await cancelPendingTxs(balancePendingTxs);
      const description = saleDescriptionFromSnapshot(saleDoc);
      await mirrorMixedPayments({
        vendaId,
        academyId,
        aluno_id: saleDoc.aluno_id,
        pagamentosNorm,
        description,
      });
    } else if (pendingTxs.length === 1 && pagamentosNorm.length === 1) {
      await settleSinglePendingTx({
        tx: pendingTxs[0],
        pagamento: pagamentosNorm[0],
        financeConfig,
        academyId,
        settledAt,
      });
    } else if (pendingTxs.length) {
      await cancelPendingTxs(pendingTxs);
      const description = saleDescriptionFromSnapshot(saleDoc);
      await mirrorMixedPayments({
        vendaId,
        academyId,
        aluno_id: saleDoc.aluno_id,
        pagamentosNorm,
        description,
      });
    } else {
      const description = saleDescriptionFromSnapshot(saleDoc);
      await mirrorMixedPayments({
        vendaId,
        academyId,
        aluno_id: saleDoc.aluno_id,
        pagamentosNorm,
        description,
      });
    }
  }

  await recordFinancialAudit({
    action: 'sale_liquidate',
    payment_id: vendaId,
    academy_id: academyId,
    user_id: userId,
    amount: totalRounded,
    new_status: 'concluida',
  });

  return json(res, 200, {
    ok: true,
    venda_id: vendaId,
    total: totalRounded,
    status: 'concluida',
  });
}
