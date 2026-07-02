/**
 * CMV (custo da mercadoria vendida) — lançamento financeiro por item de venda.
 */
import { ID, Permission, Role } from 'node-appwrite';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import { resolveCmvUnitCost } from '../../src/lib/weightedAverageCost.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { roundMoney } from './salePayments.js';
import { createDocumentResilient } from './appwriteSchemaResilient.js';
import {
  financeTxDocumentWithOptionals,
  financeCategoryLabelFromDoc,
  normalizeTxAmounts,
} from './financeTxFields.js';
import { FINANCE_LEDGER_REGIME } from '../../src/lib/financeLedgerRegime.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

const CMV_TX_PERMS = [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

async function createCmvFinancialTx(databases, dbId, payload) {
  if (!FINANCIAL_TX_COL) return null;
  try {
    const doc = await createDocumentResilient(
      databases,
      dbId,
      FINANCIAL_TX_COL,
      ID.unique(),
      financeTxDocumentWithOptionals(payload),
      CMV_TX_PERMS
    );
    try {
      void applyAccountingSideEffectsAutoServer(
        {
          id: doc.$id,
          type: payload.type,
          category: financeCategoryLabelFromDoc(doc),
          gross: payload.gross,
          fee: 0,
          net: payload.net,
          status: 'settled',
          settledAt: payload.settledAt,
          competence_month: payload.competence_month,
          planName: payload.planName,
          note: payload.note,
        },
        payload.academyId
      );
    } catch {
      void 0;
    }
    return doc;
  } catch (e) {
    console.warn('[saleCmv] financial tx skipped', e?.message || e);
    return null;
  }
}

/**
 * Registra CMV no item da venda e cria FINANCIAL_TX de saída (stock_purchase).
 * @returns {{ cmv: number, financial_tx_id: string|null }}
 */
export async function recordSaleItemCmv(databases, {
  dbId,
  saleItemsCol,
  saleItemId,
  saleItemPatch,
  stockDoc,
  variantLabel,
  quantity,
  academyId,
  vendaId,
  settledAt,
}) {
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const unitCost = resolveCmvUnitCost(stockDoc);
  const cmv = roundMoney(qty * unitCost);

  if (saleItemsCol && saleItemId) {
    const patch = { ...saleItemPatch, cmv };
    try {
      await databases.updateDocument(dbId, saleItemsCol, saleItemId, patch);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown attribute')) throw e;
    }
  }

  let financialTxId = null;
  if (cmv > 0 && FINANCIAL_TX_COL && academyId) {
    const iso = settledAt || new Date().toISOString();
    const note = `CMV — ${String(variantLabel || 'Produto').trim()}`;
    const amounts = normalizeTxAmounts({
      type: FINANCE_CATEGORIES.CUSTO_ESTOQUE.type,
      gross: cmv,
      fee: 0,
    });
    const tx = await createCmvFinancialTx(databases, dbId, {
      academyId,
      saleId: vendaId || '',
      lead_id: '',
      method: 'interno',
      installments: 1,
      type: FINANCE_CATEGORIES.CUSTO_ESTOQUE.type,
      category: FINANCE_CATEGORIES.CUSTO_ESTOQUE.label,
      competence_month: competenceMonthFromIso(iso),
      planName: note,
      gross: amounts.gross,
      fee: amounts.fee,
      net: amounts.net,
      status: 'settled',
      settledAt: iso,
      note,
      origin_type: 'sale_cmv',
      origin_id: vendaId || saleItemId || '',
      direction: amounts.direction,
      ledger_regime: FINANCE_LEDGER_REGIME.ACCRUAL,
    });
    financialTxId = tx?.$id || null;
  }

  return { cmv, financial_tx_id: financialTxId };
}
