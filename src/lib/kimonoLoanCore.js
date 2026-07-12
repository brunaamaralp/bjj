/**
 * Lógica compartilhada de empréstimo de kimono (Recepção).
 */
import { productTypeShowsRentalPools, rentalAvailable, normalizeProductType } from './dualStockPools.js';

export const KIMONO_LOAN_STATUS = {
  OUT: 'out',
  RETURNED: 'returned',
};

export const KIMONO_BORROWER_TYPES = {
  LEAD: 'lead',
  STUDENT: 'student',
  CLIENT: 'client',
};

/** Produto elegível para pool de aluguel (kimono / both / rental). */
export function isRentalEligibleParent(parent) {
  if (!parent) return false;
  const type = normalizeProductType(parent.type);
  if (!productTypeShowsRentalPools(type)) return false;
  const name = String(parent.name || parent.nome || '').toLowerCase();
  const cat = String(parent.category || parent.categoria || '').toLowerCase();
  if (name.includes('kimono') || name.includes('gi ') || name.startsWith('gi ')) return true;
  if (cat.includes('vestu') || cat.includes('uniform')) return true;
  return type === 'rental';
}

export function variantRentalAvailable(variant, parent) {
  const type = normalizeProductType(parent?.type || variant?.type);
  if (!productTypeShowsRentalPools(type)) return 0;
  return rentalAvailable(variant);
}

export function isKimonoLoanOverdue(lentAtIso, overdueHours, now = new Date()) {
  const lent = new Date(String(lentAtIso || ''));
  if (Number.isNaN(lent.getTime())) return false;
  const hours = Math.max(1, Number(overdueHours) || 4);
  const ms = hours * 60 * 60 * 1000;
  return now.getTime() - lent.getTime() >= ms;
}

export function formatKimonoLoanElapsed(lentAtIso, now = new Date()) {
  const lent = new Date(String(lentAtIso || ''));
  if (Number.isNaN(lent.getTime())) return '—';
  const diffMs = Math.max(0, now.getTime() - lent.getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function mapKimonoLoanDoc(doc, { overdueHours = 4, now = new Date() } = {}) {
  if (!doc) return null;
  const lentAt = String(doc.lent_at || doc.$createdAt || '').trim();
  const overdue = doc.status === KIMONO_LOAN_STATUS.OUT && isKimonoLoanOverdue(lentAt, overdueHours, now);
  const notes = String(doc.notes || '');
  const sourceMatch = notes.match(/origem:([a-z_]+)/i);
  return {
    id: doc.$id,
    academy_id: doc.academy_id,
    variant_id: doc.variant_id,
    product_id: doc.product_id || '',
    borrower_type: doc.borrower_type,
    borrower_id: doc.borrower_id,
    borrower_name: doc.borrower_name || '',
    size_label: doc.size_label || '',
    item_label: doc.item_label || '',
    status: doc.status || KIMONO_LOAN_STATUS.OUT,
    lent_at: lentAt,
    returned_at: doc.returned_at || '',
    stock_move_out_id: doc.stock_move_out_id || '',
    stock_move_in_id: doc.stock_move_in_id || '',
    overdue,
    elapsed_label: formatKimonoLoanElapsed(lentAt, now),
    source: sourceMatch ? sourceMatch[1] : '',
  };
}
