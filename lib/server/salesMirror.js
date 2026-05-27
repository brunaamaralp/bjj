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
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';

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

async function createFinancialTx(payload) {
  let doc;
  try {
    doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), payload);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute')) {
      const next = { ...payload };
      for (const key of ['lead_id', 'origin_type', 'origin_id', 'direction', 'competence_month', 'category']) {
        delete next[key];
      }
      doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), next);
    } else {
      throw e;
    }
  }
  if (doc && String(doc.status || '').toLowerCase() === 'settled') {
    const mapped = {
      id: doc.$id,
      type: doc.type,
      category: doc.category,
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

export async function mirrorMixedPayments({
  vendaId,
  academyId,
  aluno_id,
  pagamentosNorm,
  description,
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

  const existing = await listSaleFinancialTx(vendaId);
  const settledAt = new Date().toISOString();
  const competenceMonth = competenceMonthFromIso(settledAt);
  const shortId = String(vendaId).slice(-4).toUpperCase();

  for (const p of pagamentosNorm) {
    const gross = roundMoney(p.valor);
    const already = existing.some(
      (d) =>
        String(d.type || '') === FINANCE_CATEGORIES.VENDA_PRODUTO.type &&
        String(d.method || '') === p.forma &&
        Math.abs(Number(d.gross || 0) - gross) < 0.01
    );
    if (already) continue;
    try {
      const doc = await createFinancialTx({
        academyId: academyId || '',
        saleId: vendaId,
        lead_id: aluno_id || '',
        method: p.forma,
        installments: 1,
        type: FINANCE_CATEGORIES.VENDA_PRODUTO.type,
        category: FINANCE_CATEGORIES.VENDA_PRODUTO.label,
        competence_month: competenceMonth,
        planName: description,
        gross,
        fee: 0,
        net: gross,
        direction: 'in',
        status: 'settled',
        settledAt,
        note: description,
        origin_type: 'sale',
        origin_id: vendaId,
      });
      existing.push(doc);
    } catch (e) {
      console.warn('[salesMirror] payment', p.forma, e?.message);
      warnings.push(`Não foi possível registrar no caixa: ${p.forma}`);
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
        status: 'settled',
        settledAt,
        note,
      });
      existing.push(doc);
    } catch (e) {
      console.warn('[salesMirror] troco', e?.message);
      warnings.push(`Troco (${formaTroco}) não registrado no caixa — confira manualmente.`);
    }
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
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };
  const existing = await listSaleFinancialTx(vendaId);
  if (existing.some((d) => String(d.type || '') === FINANCE_CATEGORIES.VENDA_PRODUTO.type)) {
    return { warnings };
  }
  const settledAt = new Date().toISOString();
  try {
    await createFinancialTx({
      academyId: academyId || '',
      saleId: vendaId,
      lead_id: aluno_id || '',
      method: method || 'pix',
      installments: 1,
      type: FINANCE_CATEGORIES.VENDA_PRODUTO.type,
      category: FINANCE_CATEGORIES.VENDA_PRODUTO.label,
      competence_month: competenceMonthFromIso(settledAt),
      planName: description,
      gross: totalVenda,
      fee: 0,
      net: totalVenda,
      direction: 'in',
      status: 'settled',
      settledAt,
      note: description,
      origin_type: 'sale',
      origin_id: vendaId,
    });
  } catch (e) {
    console.warn('[salesMirror] single', e?.message);
    warnings.push('Espelho no Caixa não criado.');
  }
  return { warnings };
}

/** Venda a prazo: um lançamento pendente no Caixa até liquidação. */
export async function mirrorDeferredSale({
  vendaId,
  totalRounded,
  description,
  academyId,
  aluno_id,
  due_date,
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

  const existing = await listSaleFinancialTx(vendaId);
  if (
    existing.some(
      (d) =>
        String(d.type || '') === FINANCE_CATEGORIES.VENDA_PRODUTO.type &&
        String(d.status || '').toLowerCase() === 'pending'
    )
  ) {
    return { warnings };
  }

  const dueYmd = String(due_date || '').slice(0, 10);
  const note = `Venda a prazo — ${vendaId}`;
  const competenceMonth = competenceMonthFromIso(
    dueYmd ? `${dueYmd}T12:00:00.000Z` : new Date().toISOString()
  );

  try {
    const payload = {
      academyId: academyId || '',
      saleId: vendaId,
      lead_id: aluno_id || '',
      method: 'outro',
      installments: 1,
      type: FINANCE_CATEGORIES.VENDA_PRODUTO.type,
      category: FINANCE_CATEGORIES.VENDA_PRODUTO.label,
      competence_month: competenceMonth,
      planName: description,
      gross: totalRounded,
      fee: 0,
      net: totalRounded,
      direction: 'in',
      status: 'pending',
      note,
      origin_type: 'sale',
      origin_id: vendaId,
    };
    if (dueYmd) payload.due_date = dueYmd;
    await createFinancialTx(payload);
  } catch (e) {
    console.warn('[salesMirror] deferred', e?.message);
    warnings.push('Espelho pendente no Caixa não criado.');
  }
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
}) {
  if (pagamentosNorm?.length) {
    return mirrorMixedPayments({
      vendaId,
      academyId,
      aluno_id,
      pagamentosNorm,
      description,
    });
  }
  return mirrorLegacySingleTx({
    vendaId,
    academyId,
    aluno_id,
    totalVenda: totalRounded,
    method: formaFinal,
    description,
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
  const hasTx = (await listSaleFinancialTx(vendaId)).length > 0;
  return { ok: hasTx, warnings: result.warnings || [] };
}

/** Estorno financeiro ao cancelar venda. */
export async function mirrorSaleRefund({ vendaId, academyId, totalVenda, method, note }) {
  if (!FINANCIAL_TX_COL || !vendaId || totalVenda <= 0) return null;
  const settledAt = new Date().toISOString();
  return createFinancialTx({
    academyId: academyId || '',
    saleId: vendaId,
    method: method || 'pix',
    installments: 1,
    type: FINANCE_CATEGORIES.CANCELAMENTO.type,
    category: FINANCE_CATEGORIES.CANCELAMENTO.label,
    competence_month: competenceMonthFromIso(settledAt),
    planName: note,
    gross: totalVenda,
    fee: 0,
    net: totalVenda,
    direction: 'out',
    status: 'settled',
    settledAt,
    note,
    origin_type: 'sale',
    origin_id: vendaId,
  });
}
