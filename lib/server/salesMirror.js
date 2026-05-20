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
import { parseAcademySettings } from '../../src/lib/stockSettings.js';
import { itemDisplayName } from '../../functions/stockBalance.mjs';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL || process.env.VITE_APPWRITE_SALE_ITEMS_COLLECTION_ID || '';
const STOCK_ITEMS_COL =
  process.env.STOCK_ITEMS_COL || process.env.VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID || '';

export function resolveSaleIncomeCategory(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const fromSales = String(settings?.sales?.saleIncomeCategory || '').trim();
  if (fromSales) return fromSales;
  return String(settings?.stockSaleIncomeCategory || '').trim() || 'Vendas — produtos';
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

async function createFinancialTx(payload) {
  try {
    return await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), payload);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown attribute')) {
      const next = { ...payload };
      delete next.lead_id;
      delete next.origin_type;
      delete next.origin_id;
      delete next.direction;
      return await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), next);
    }
    throw e;
  }
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
  saleIncomeCategory,
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

  const existing = await listSaleFinancialTx(vendaId);
  const settledAt = new Date().toISOString();
  const shortId = String(vendaId).slice(-4).toUpperCase();

  for (const p of pagamentosNorm) {
    const gross = roundMoney(p.valor);
    const already = existing.some(
      (d) =>
        String(d.type || '') === 'product' &&
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
        type: 'product',
        planName: saleIncomeCategory,
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
        String(d.type || '') === 'expense' &&
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
        type: 'expense',
        planName: note,
        gross: troco,
        fee: 0,
        net: troco,
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
  saleIncomeCategory,
}) {
  const warnings = [];
  if (!FINANCIAL_TX_COL || !vendaId) return { warnings };
  const existing = await listSaleFinancialTx(vendaId);
  if (existing.some((d) => String(d.type || '') === 'product')) return { warnings };
  const settledAt = new Date().toISOString();
  try {
    await createFinancialTx({
      academyId: academyId || '',
      saleId: vendaId,
      lead_id: aluno_id || '',
      method: method || 'pix',
      installments: 1,
      type: 'product',
      planName: saleIncomeCategory,
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

export async function mirrorSaleFinancials({
  vendaId,
  totalRounded,
  pagamentosNorm,
  formaFinal,
  description,
  academyId,
  aluno_id,
  saleIncomeCategory,
}) {
  if (pagamentosNorm?.length) {
    return mirrorMixedPayments({
      vendaId,
      academyId,
      aluno_id,
      pagamentosNorm,
      description,
      saleIncomeCategory,
    });
  }
  return mirrorLegacySingleTx({
    vendaId,
    academyId,
    aluno_id,
    totalVenda: totalRounded,
    method: formaFinal,
    description,
    saleIncomeCategory,
  });
}

export async function mirrorSaleFinancialsForDoc(saleDoc, academyDoc) {
  const vendaId = saleDoc.$id;
  const academyId = String(saleDoc.academyId || saleDoc.academy_id || academyDoc?.$id || '');
  const saleIncomeCategory = resolveSaleIncomeCategory(academyDoc?.settings);
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
    saleIncomeCategory,
  });
  const hasTx = (await listSaleFinancialTx(vendaId)).length > 0;
  return { ok: hasTx, warnings: result.warnings || [] };
}
