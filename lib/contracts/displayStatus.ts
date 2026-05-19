export type ContractDisplayStatus = 'pending' | 'partial' | 'completed' | 'cancelled';

const SIGNED_STATUSES = new Set(['signed', 'accepted']);
const CANCELLED_STATUSES = new Set(['deleted', 'cancelled', 'rejected', 'removed']);
const COMPLETED_STATUSES = new Set(['finished', 'completed']);

export function mapContractDisplayStatus(
  backendStatus: string,
  signersSigned = 0,
  signersTotal = 0
): ContractDisplayStatus {
  const s = String(backendStatus || '').toLowerCase();

  if (CANCELLED_STATUSES.has(s)) return 'cancelled';
  if (COMPLETED_STATUSES.has(s)) return 'completed';

  if (signersTotal > 0) {
    if (signersSigned >= signersTotal) return 'completed';
    if (signersSigned > 0) return 'partial';
  }

  if (s === 'in_progress' || s === 'created' || s === 'viewed' || s === 'updated') {
    return signersSigned > 0 ? 'partial' : 'pending';
  }

  return 'pending';
}
