import React from 'react';
import type { ContractDisplayStatus } from '../../features/contracts/types.js';
import { CONTRACT_STATUS_LABELS, signerStatusLabel } from '../../features/contracts/status.js';

const CLASS_MAP: Record<ContractDisplayStatus, string> = {
  pending: 'contract-badge contract-badge--pending',
  completed: 'contract-badge contract-badge--completed',
  cancelled: 'contract-badge contract-badge--cancelled',
  partial: 'contract-badge contract-badge--partial',
};

export default function ContractStatusBadge({ status }: { status: ContractDisplayStatus }) {
  return (
    <span className={CLASS_MAP[status] || CLASS_MAP.pending}>
      {CONTRACT_STATUS_LABELS[status] || status}
    </span>
  );
}

export function SignerStatusBadge({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  let cls = 'contract-badge contract-badge--signer-pending';
  if (s === 'signed' || s === 'accepted') cls = 'contract-badge contract-badge--completed';
  else if (s === 'viewed') cls = 'contract-badge contract-badge--partial';
  else if (s === 'rejected' || s === 'removed' || s === 'delivery_failed') cls = 'contract-badge contract-badge--cancelled';

  return <span className={cls}>{signerStatusLabel(status)}</span>;
}
