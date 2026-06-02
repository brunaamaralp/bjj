/**
 * CMV (custo da mercadoria vendida) — lançamento financeiro por item de venda.
 */
import { ID, Permission, Role } from 'node-appwrite';
import { FINANCE_CATEGORIES } from '../../src/lib/financeCategories.js';
import { competenceMonthFromIso } from '../../src/lib/financeCompetence.js';
import { readAverageCost } from '../../src/lib/weightedAverageCost.js';
import { applyAccountingSideEffectsAutoServer } from './financeJournalServer.js';
import { roundMoney } from './salePayments.js';
import { createDocumentResilient } from './appwriteSchemaResilient.js';
import { parseFinanceConfig } from './financeTxFields.js';
import { resolveBankAccountForPayment } from '../../src/lib/bankAccounts.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COL_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

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
      payload,
      CMV_TX_PERMS
    );
    try {
      void applyAccountingSideEffectsAutoServer(
        {
          id: doc.$id,
          type: payload.type,
          category: payload.category,
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
  const avg = readAverageCost(stockDoc);
  const cmv = roundMoney(qty * avg);

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
    let bank_account = '';
    if (ACADEMIES_COL) {
      try {
        const academyDoc = await databases.getDocument(dbId, ACADEMIES_COL, academyId);
        const cfg = parseFinanceConfig(academyDoc.financeConfig);
        bank_account = resolveBankAccountForPayment('', cfg);
      } catch {
        bank_account = '';
      }
    }
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
      gross: -cmv,
      fee: 0,
      net: -cmv,
      status: 'settled',
      settledAt: iso,
      note,
      origin_type: 'sale_cmv',
      origin_id: vendaId || saleItemId || '',
      direction: 'out',
      ...(bank_account ? { bank_account: String(bank_account).slice(0, 128) } : {}),
    });
    financialTxId = tx?.$id || null;
  }

  return { cmv, financial_tx_id: financialTxId };
}
