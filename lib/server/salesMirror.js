/**
 * Espelho de vendas no Caixa (FINANCIAL_TX) — compartilhado entre create e reconcile.
 */
import { Query, ID } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import {
  normalizePagamentosInput,
  buildFormaPagamentoResumo,
  roundMoney,
} from './salePayments.js';
import { itemDisplayName } from '../../functions/stockBalance.mjs';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { splitPagamentosByGrossShares } from '../../src/lib/saleLineKind.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import {
  parseFinanceConfig,
  financeTxDocumentWithOptionals,
  stripUnknownFinanceTxAttrs,
  financeCategoryLabelFromDoc,
} from './financeTxFields.js';
import { mirrorAmountsForPaymentWithAccount } from '../../src/lib/resolveAcquirerFees.js';
import { financialTxSettlementFields } from '../../src/lib/paymentSettlement.js';
import { resolveSaleMirrorBankAccountForPayment } from './salePaymentRules.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COL_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';

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

const SALE_REVENUE_TX_TYPES = new Set(['product', 'rental']);

/** Venda já tem entrada de receita no Caixa (ignora CMV e troco). */
export async function saleHasRevenueMirror(vendaId) {
  const existing = await listSaleFinancialTx(vendaId);
  return existing.some((d) => {
    const type = String(d.type || '').toLowerCase();
    if (SALE_REVENUE_TX_TYPES.has(type)) return true;
    const origin = String(d.origin_type || '').toLowerCase();
    return origin === 'sale' && type !== 'stock_purchase';
  });
}

async function loadFinanceConfig(academyId) {
  if (!ACADEMIES_COL || !academyId) return { bankAccounts: [] };
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    return parseFinanceConfig(doc.financeConfig);
  } catch {
    return { bankAccounts: [] };
  }
}

async function resolveSaleBankAccount(academyId, explicit = '', method = '') {
  const cfg = await loadFinanceConfig(academyId);
  const label = resolveSaleMirrorBankAccountForPayment(cfg, { forma: method }, explicit);
  return label ? String(label).slice(0, 128) : '';
}

async function writeFinancialTxDocument(payload) {
  try {
    return await databases.createDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      ID.unique(),
      financeTxDocumentWithOptionals(payload)
    );
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    return databases.createDocument(
      DB_ID,
      FINANCIAL_TX_COL,
      ID.unique(),
      stripUnknownFinanceTxAttrs(payload)
    );
  }
}

async function createFinancialTx(payload) {
  const doc = await writeFinancialTxDocument(payload);
  if (doc && String(doc.status || '').toLowerCase() === 'settled') {
    const mapped = {
      id: doc.$id,
      type: doc.type,
      category: financeCategoryLabelFromDoc(doc),
      gross: doc.gross,
      fee: doc.fee,
      net: doc.net,
      status: doc.status,
      settledAt: doc.settledAt,
      competence_month: doc.competence_month,
      planName: doc.planName,
      note: doc.note,
    };
    void applyAccountingSideEffectsAutoServer(mapped, doc.academyId);
  }
  return doc;
}

async function buildDescriptionFromSale(vendaId) {
  if (!SALE_ITEMS_COL) return 'Venda de produtos';
  try {
    const items = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
      Query.equal('venda_id', vendaId),
      Query.limit(50),
    ]);
    const parts = [];
    for (const it of items.documents || []) {
      let name = 'Produto';
      if (STOCK_ITEMS_COL && it.item_estoque_id) {
        try {
          const stock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
          name = itemDisplayName(stock);
        } catch {
          void 0;
        }
      }
      const q = Number(it.quantidade) || 1;
      parts.push(q > 1 ? `${name} x${q}` : name);
    }
    return parts.join(', ') || 'Venda de produtos';
  } catch {
    return 'Venda de produtos';
  }
}

export async function mirrorMixedPaymentsForCategory({
  vendaId,
  academyId,
  aluno_id,
  pagamentosNorm,
  description,
  bankAccount = '',
  categoryKey = 'VENDA_PRODUTO',
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

  const cat = FINANCE_CATEGORIES[categoryKey] || FINANCE_CATEGORIES.VENDA_PRODUTO;
  const existing = await listSaleFinancialTx(vendaId);
  const nowIso = new Date().toISOString();
  const competenceMonth = competenceMonthFromIso(nowIso);
  const shortId = String(vendaId).slice(-4).toUpperCase();
  const financeConfig = await loadFinanceConfig(academyId);

  for (const p of pagamentosNorm) {
    const gross = roundMoney(p.valor);
    const installments = Math.min(12, Math.max(1, Number(p.installments) || 1));
    const bank_account = resolveSaleMirrorBankAccountForPayment(financeConfig, p, bankAccount);
    const { fee, net } = mirrorAmountsForPaymentWithAccount({
      gross,
      policy: financeConfig?.acquirerFeePolicy,
      method: p.forma,
      installments,
      financeConfig,
      bankAccount: bank_account || '',
      captureMethodId: p.capture_method_id || '',
      feeReceiverId: p.fee_receiver_id || '',
      cardBrand: p.card_brand || '',
    });
    const already = existing.some(
      (d) =>
        String(d.type || '') === cat.type &&
        String(d.category || '') === cat.label &&
        String(d.method || '') === p.forma &&
        Math.abs(Number(d.gross || 0) - gross) < 0.01
    );
    if (already) continue;
    const settlement = financialTxSettlementFields({
      financeConfig,
      method: p.forma,
      paidAt: nowIso,
      captureMethodId: p.capture_method_id || '',
      installments,
    });
    try {
      const doc = await createFinancialTx({
        academyId: academyId || '',
        saleId: vendaId,
        lead_id: aluno_id || '',
        method: p.forma,
        installments,
        type: cat.type,
        category: cat.label,
        competence_month: competenceMonth,
        planName: description,
        gross,
        fee,
        net,
        direction: 'in',
        status: settlement.status,
        settledAt: settlement.settledAt,
        expected_settlement_at: settlement.expected_settlement_at,
        note: description,
        origin_type: 'sale',
        origin_id: vendaId,
        ...(p.capture_method_id ? { capture_method_id: p.capture_method_id } : {}),
        ...(bank_account ? { bank_account } : {}),
      });
      existing.push(doc);
    } catch (e) {
      console.warn('[salesMirror] payment', categoryKey, p.forma, e?.message);
      warnings.push(`Não foi possível registrar no caixa (${cat.label}): ${p.forma}`);
    }
  }

  for (const p of pagamentosNorm) {
    const troco = roundMoney(p.troco || 0);
    if (troco <= 0) continue;
    const formaTroco = p.forma_troco || 'pix';
    const note = `Troco — venda #${shortId}`;
    const already = existing.some(
      (d) =>
        String(d.type || '') === FINANCE_CATEGORIES.OUTRAS_DESPESAS.type &&
        String(d.method || '') === formaTroco &&
        Math.abs(Number(d.gross || 0) - troco) < 0.01
    );
    if (already) continue;
    const trocoSettlement = financialTxSettlementFields({
      financeConfig,
      method: formaTroco,
      paidAt: nowIso,
    });
    try {
      const doc = await createFinancialTx({
        academyId: academyId || '',
        saleId: vendaId,
        lead_id: aluno_id || '',
        method: formaTroco,
        installments: 1,
        type: FINANCE_CATEGORIES.OUTRAS_DESPESAS.type,
        category: FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
        competence_month: competenceMonth,
        planName: note,
        gross: troco,
        fee: 0,
        net: troco,
        direction: 'out',
        status: trocoSettlement.status,
        settledAt: trocoSettlement.settledAt,
        expected_settlement_at: trocoSettlement.expected_settlement_at,
        note,
        ...(bank_account ? { bank_account } : {}),
      });
      existing.push(doc);
    } catch (e) {
      console.warn('[salesMirror] troco', e?.message);
      warnings.push(`Troco (${formaTroco}) não registrado no caixa — confira manualmente.`);
    }
  }

  return { warnings };
}

export async function mirrorMixedPayments({
  vendaId,
  academyId,
  aluno_id,
  pagamentosNorm,
  description,
  bankAccount = '',
}) {
  return mirrorMixedPaymentsForCategory({
    vendaId,
    academyId,
    aluno_id,
    pagamentosNorm,
    description,
    bankAccount,
    categoryKey: 'VENDA_PRODUTO',
  });
}

/** Espelha receitas no Caixa separando venda de produto e aluguel. */
export async function mirrorSaleFinancialsByLineKinds({
  vendaId,
  totalRounded,
  pagamentosNorm,
  formaFinal,
  description,
  academyId,
  aluno_id,
  lineKindGross = {},
  bankAccount = '',
}) {
  const saleGross = roundMoney(lineKindGross.VENDA_PRODUTO || 0);
  const rentalGross = roundMoney(lineKindGross.ALUGUEL_RECEITA || 0);
  const hasRental = rentalGross > 0.009;
  const hasSale = saleGross > 0.009;

  if (!hasRental) {
    return mirrorSaleFinancials({
      vendaId,
      totalRounded,
      pagamentosNorm,
      formaFinal,
      description,
      academyId,
      aluno_id,
      bankAccount,
    });
  }

  if (!hasSale) {
    if (pagamentosNorm?.length) {
      return mirrorMixedPaymentsForCategory({
        vendaId,
        academyId,
        aluno_id,
        pagamentosNorm,
        description,
        bankAccount,
        categoryKey: 'ALUGUEL_RECEITA',
      });
    }
    return mirrorLegacySingleTx({
      vendaId,
      academyId,
      aluno_id,
      totalVenda: totalRounded,
      method: formaFinal,
      description,
      bankAccount,
      categoryKey: 'ALUGUEL_RECEITA',
    });
  }

  const shares = splitPagamentosByGrossShares(pagamentosNorm, [
    { key: 'VENDA_PRODUTO', gross: saleGross },
    { key: 'ALUGUEL_RECEITA', gross: rentalGross },
  ]);

  const warnings = [];
  for (const [categoryKey, scaledPayments] of shares.entries()) {
    const part = await mirrorMixedPaymentsForCategory({
      vendaId,
      academyId,
      aluno_id,
      pagamentosNorm: scaledPayments,
      description,
      bankAccount,
      categoryKey,
    });
    warnings.push(...(part.warnings || []));
  }
  return { warnings };
}

export async function mirrorLegacySingleTx({
  vendaId,
  academyId,
  aluno_id,
  totalVenda,
  method,
  description,
  bankAccount = '',
  categoryKey = 'VENDA_PRODUTO',
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };
  const cat = FINANCE_CATEGORIES[categoryKey] || FINANCE_CATEGORIES.VENDA_PRODUTO;
  const existing = await listSaleFinancialTx(vendaId);
  if (existing.some((d) => String(d.type || '') === cat.type && String(d.category || '') === cat.label)) {
    return { warnings };
  }
  const paidAt = new Date().toISOString();
  const bank_account = await resolveSaleBankAccount(academyId, bankAccount, method || 'pix');
  const financeConfig = await loadFinanceConfig(academyId);
  const installments = 1;
  const { fee, net } = mirrorAmountsForPaymentWithAccount({
    gross: totalVenda,
    policy: financeConfig?.acquirerFeePolicy,
    method: method || 'pix',
    installments,
    financeConfig,
    bankAccount: bank_account,
  });
  const settlement = financialTxSettlementFields({
    financeConfig,
    method: method || 'pix',
    paidAt,
  });
  try {
    await createFinancialTx({
      academyId: academyId || '',
      saleId: vendaId,
      lead_id: aluno_id || '',
      method: method || 'pix',
      installments,
      type: cat.type,
      category: cat.label,
      competence_month: competenceMonthFromIso(paidAt),
      planName: description,
      gross: totalVenda,
      fee,
      net,
      direction: 'in',
      status: settlement.status,
      settledAt: settlement.settledAt,
      expected_settlement_at: settlement.expected_settlement_at,
      note: description,
      origin_type: 'sale',
      origin_id: vendaId,
      ...(bank_account ? { bank_account } : {}),
    });
  } catch (e) {
    console.warn('[salesMirror] single', e?.message);
    warnings.push('Espelho no Caixa não criado.');
  }
  return { warnings };
}

export async function mirrorDeferredSale({
  vendaId,
  totalRounded,
  description,
  academyId,
  aluno_id,
  due_date,
  lineKindGross = {},
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

  const saleGross = roundMoney(lineKindGross.VENDA_PRODUTO || totalRounded);
  const rentalGross = roundMoney(lineKindGross.ALUGUEL_RECEITA || 0);
  const entries = [];
  if (saleGross > 0.009) entries.push({ categoryKey: 'VENDA_PRODUTO', gross: saleGross });
  if (rentalGross > 0.009) entries.push({ categoryKey: 'ALUGUEL_RECEITA', gross: rentalGross });
  if (!entries.length) entries.push({ categoryKey: 'VENDA_PRODUTO', gross: totalRounded });

  const existing = await listSaleFinancialTx(vendaId);
  const dueYmd = String(due_date || '').slice(0, 10);
  const note = `Venda a prazo — ${vendaId}`;
  const competenceMonth = competenceMonthFromIso(
    dueYmd ? `${dueYmd}T12:00:00.000Z` : new Date().toISOString()
  );

  for (const entry of entries) {
    const cat = FINANCE_CATEGORIES[entry.categoryKey] || FINANCE_CATEGORIES.VENDA_PRODUTO;
    if (
      existing.some(
        (d) =>
          String(d.type || '') === cat.type &&
          String(d.category || '') === cat.label &&
          String(d.status || '').toLowerCase() === 'pending'
      )
    ) {
      continue;
    }
    try {
      const payload = {
        academyId: academyId || '',
        saleId: vendaId,
        lead_id: aluno_id || '',
        method: 'outro',
        installments: 1,
        type: cat.type,
        category: cat.label,
        competence_month: competenceMonth,
        planName: description,
        gross: entry.gross,
        fee: 0,
        net: entry.gross,
        direction: 'in',
        status: 'pending',
        note,
        origin_type: 'sale',
        origin_id: vendaId,
      };
      if (dueYmd) payload.due_date = dueYmd;
      await createFinancialTx(payload);
    } catch (e) {
      console.warn('[salesMirror] deferred', entry.categoryKey, e?.message);
      warnings.push(`Espelho pendente (${cat.label}) não criado.`);
    }
  }
  return { warnings };
}

/** Cancela TX pendentes da venda e recria espelho pendente pelo saldo restante. */
export async function refreshPendingSaleBalance({
  vendaId,
  academyId,
  aluno_id,
  remainingGross,
  description,
  due_date,
  lineKindGross = {},
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

  const existing = await listSaleFinancialTx(vendaId);
  for (const tx of existing) {
    if (String(tx.status || '').toLowerCase() !== 'pending') continue;
    try {
      await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tx.$id, {
        status: 'cancelled',
        settledAt: '',
      });
    } catch (e) {
      console.warn('[salesMirror] cancel pending', e?.message);
      warnings.push('Não foi possível atualizar lançamento pendente no Caixa.');
    }
  }

  const remaining = roundMoney(remainingGross);
  if (remaining <= 0.009) return { warnings };

  const part = await mirrorDeferredSale({
    vendaId,
    totalRounded: remaining,
    description,
    academyId,
    aluno_id,
    due_date,
    lineKindGross,
  });
  warnings.push(...(part.warnings || []));
  return { warnings };
}

export async function mirrorSaleFinancials({
  vendaId,
  totalRounded,
  pagamentosNorm,
  formaFinal,
  description,
  academyId,
  aluno_id,
  bankAccount = '',
}) {
  if (pagamentosNorm?.length) {
    return mirrorMixedPayments({
      vendaId,
      academyId,
      aluno_id,
      pagamentosNorm,
      description,
      bankAccount,
    });
  }
  return mirrorLegacySingleTx({
    vendaId,
    academyId,
    aluno_id,
    totalVenda: totalRounded,
    method: formaFinal,
    description,
    bankAccount,
  });
}

export async function mirrorSaleFinancialsForDoc(saleDoc, academyDoc) {
  const vendaId = saleDoc.$id;
  const academyId = String(saleDoc.academyId || saleDoc.academy_id || academyDoc?.$id || '');
  const description = await buildDescriptionFromSale(vendaId);
  let pagamentosNorm = [];
  if (saleDoc.pagamentos_json) {
    try {
      pagamentosNorm = normalizePagamentosInput(JSON.parse(saleDoc.pagamentos_json));
    } catch {
      pagamentosNorm = [];
    }
  }
  const result = await mirrorSaleFinancials({
    vendaId,
    totalRounded: Number(saleDoc.total || 0),
    pagamentosNorm,
    formaFinal: saleDoc.forma_pagamento,
    description,
    academyId,
    aluno_id: saleDoc.aluno_id,
  });
  const hasTx = await saleHasRevenueMirror(vendaId);
  return { ok: hasTx, warnings: result.warnings || [] };
}

/** Estorno financeiro ao cancelar venda. */
export async function mirrorSaleRefund({
  vendaId,
  academyId,
  totalVenda,
  method,
  note,
  originalTxId = '',
}) {
  if (!FINANCIAL_TX_COL || !vendaId || totalVenda <= 0) return null;
  const paidAt = new Date().toISOString();
  const bank_account = await resolveSaleBankAccount(academyId, '');
  const financeConfig = await loadFinanceConfig(academyId);
  const settlement = financialTxSettlementFields({
    financeConfig,
    method: method || 'pix',
    paidAt,
  });
  const origId = String(originalTxId || '').trim();
  return createFinancialTx({
    academyId: academyId || '',
    saleId: vendaId,
    method: method || 'pix',
    installments: 1,
    type: FINANCE_CATEGORIES.CANCELAMENTO.type,
    category: FINANCE_CATEGORIES.CANCELAMENTO.label,
    competence_month: competenceMonthFromIso(paidAt),
    planName: note,
    gross: totalVenda,
    fee: 0,
    net: totalVenda,
    direction: 'out',
    status: settlement.status,
    settledAt: settlement.settledAt,
    expected_settlement_at: settlement.expected_settlement_at,
    note,
    origin_type: origId ? 'reversal' : 'sale',
    origin_id: origId || vendaId,
    ...(origId ? { reverses_id: origId } : {}),
    ...(bank_account ? { bank_account } : {}),
  });
}
