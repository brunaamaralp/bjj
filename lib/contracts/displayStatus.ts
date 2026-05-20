import { isPastIso } from './contractSignaturePolicy.js';

export type ContractDisplayStatus =
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'expired'
  | 'cancelled';

const CANCELLED_STATUSES = new Set(['deleted', 'cancelled', 'rejected', 'removed', 'expired']);
const COMPLETED_STATUSES = new Set(['finished', 'completed']);

export type ContractDisplayContext = {
  signersViewed?: number;
  expiresAt?: string | null;
  metaStatus?: string | null;
};

export function mapContractDisplayStatus(
  backendStatus: string,
  signersSigned = 0,
  signersTotal = 0,
  ctx: ContractDisplayContext = {}
): ContractDisplayStatus {
  const s = String(backendStatus || '').toLowerCase();
  const meta = String(ctx.metaStatus || '').trim();

  if (CANCELLED_STATUSES.has(s) || s === 'cancelled') return 'cancelled';

  const allSigned =
    signersTotal > 0 && signersSigned >= signersTotal
      ? true
      : COMPLETED_STATUSES.has(s) || s === 'finished';

  if (allSigned) return 'signed';

  const expiresAt = ctx.expiresAt || null;
  if (isPastIso(expiresAt) && s !== 'finished' && s !== 'completed') {
    return 'expired';
  }

  const viewed = Number(ctx.signersViewed) || 0;
  if (viewed > 0 || s === 'viewed') return 'viewed';

  if (meta === 'signed_after_offboarding') return 'signed';

  return 'sent';
}

/** Compat: aliases antigos pending/partial/completed */
export function mapLegacyDisplayStatus(
  status: ContractDisplayStatus
): 'pending' | 'partial' | 'completed' | 'cancelled' {
  if (status === 'signed') return 'completed';
  if (status === 'viewed') return 'partial';
  if (status === 'cancelled' || status === 'expired') return 'cancelled';
  return 'pending';
}
