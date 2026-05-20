/**
 * Alerta diário: academias com finance ativo e transações pending > X dias
 * ou fechamento do mês anterior não conferido (cash_closing).
 */
import { Query } from 'node-appwrite';
import { databases, DB_ID } from './academyAccess.js';
import { notifyAcademyOwner } from './notifyAcademy.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const CASH_CLOSING_COL =
  process.env.APPWRITE_CASH_CLOSING_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CASH_CLOSING_COLLECTION_ID ||
  '';

const PENDING_DAYS = Math.max(1, Number(process.env.FINANCE_PENDING_ALERT_DAYS || 7) || 7);

function parseModules(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function previousYm() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function runFinancePendingAlert() {
  if (!ACADEMIES_COL || !DB_ID) return { notified: 0, skipped: 'not_configured' };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PENDING_DAYS);
  const cutoffIso = cutoff.toISOString();
  const prevMonth = previousYm();
  let notified = 0;

  const academies = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
    Query.limit(100),
    Query.equal('status', ['active']),
  ]);

  for (const academy of academies.documents || []) {
    const mods = parseModules(academy.modules);
    if (mods.finance !== true) continue;

    const academyId = academy.$id;
    let reason = '';

    if (FINANCIAL_TX_COL) {
      try {
        const pending = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
          Query.equal('academyId', academyId),
          Query.equal('status', ['pending']),
          Query.lessThan('$createdAt', cutoffIso),
          Query.limit(1),
        ]);
        if ((pending.documents || []).length > 0) {
          reason = `Há lançamentos pendentes no caixa há mais de ${PENDING_DAYS} dias.`;
        }
      } catch (e) {
        console.warn('[financePendingAlert] tx', academyId, e?.message);
      }
    }

    if (!reason && CASH_CLOSING_COL) {
      try {
        const closed = await databases.listDocuments(DB_ID, CASH_CLOSING_COL, [
          Query.equal('academy_id', academyId),
          Query.equal('reference_month', prevMonth),
          Query.limit(1),
        ]);
        if (!(closed.documents || []).length) {
          reason = `Fechamento de ${prevMonth} ainda não foi conferido no Caixa.`;
        }
      } catch (e) {
        console.warn('[financePendingAlert] closing', academyId, e?.message);
      }
    }

    if (!reason) continue;

    try {
      await notifyAcademyOwner({
        academyId,
        title: 'Caixa — pendências',
        body: reason,
        type: 'finance_pending',
      });
      notified += 1;
    } catch (e) {
      console.warn('[financePendingAlert] notify', academyId, e?.message);
    }
  }

  return { notified, pendingDays: PENDING_DAYS, prevMonth };
}
