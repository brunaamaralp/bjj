import { ID } from 'appwrite';
import { databases, DB_ID, FINANCIAL_TX_COL } from './appwrite.js';
import { buildClientDocumentPermissions } from './clientDocumentPermissions.js';

function normalizeExpenseMethod(m) {
  const raw = String(m || '').trim().toLowerCase();
  if (!raw) return 'dinheiro';
  const map = {
    pix: 'pix',
    dinheiro: 'dinheiro',
    'cartão débito': 'cartão_débito',
    'cartao débito': 'cartão_débito',
    'cartão debito': 'cartão_débito',
    'cartão crédito': 'cartão_crédito',
    'cartao crédito': 'cartão_crédito',
    transferência: 'transferência',
    transferencia: 'transferência'
  };
  if (map[raw]) return map[raw];
  if (['cartão_débito', 'cartão_crédito', 'transferência', 'dinheiro', 'pix'].includes(raw)) return raw;
  return 'dinheiro';
}

/**
 * Registra uma despesa (saída) em FINANCIAL_TX: valores negativos, já liquidado.
 * @param {{ academyId: string, teamId?: string, userId?: string, amount: number, description: string, method?: string }} p
 */
export async function createExpenseTransaction({ academyId, teamId = '', userId = '', amount, description, method }) {
  if (!FINANCIAL_TX_COL) {
    throw new Error('financial_tx_nao_configurado');
  }
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('academy_id_ausente');
  const abs = Math.abs(Number(amount) || 0);
  if (!Number.isFinite(abs) || abs <= 0) throw new Error('valor_invalido');
  const gross = -abs;
  const note = String(description || '').trim() || 'Despesa';
  const permissions = buildClientDocumentPermissions({
    teamId: String(teamId || '').trim(),
    userId: String(userId || '').trim()
  });
  return databases.createDocument(
    DB_ID,
    FINANCIAL_TX_COL,
    ID.unique(),
    {
      academyId: aid,
      saleId: '',
      lead_id: '',
      method: normalizeExpenseMethod(method),
      installments: 1,
      type: 'expense',
      planName: '',
      gross,
      fee: 0,
      net: gross,
      status: 'settled',
      settledAt: new Date().toISOString(),
      note
    },
    permissions
  );
}
