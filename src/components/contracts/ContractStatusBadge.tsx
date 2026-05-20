import React from 'react';
import type { ContractDisplayStatus } from '../../features/contracts/status.js';
import { CONTRACT_STATUS_LABELS, signerStatusLabel } from '../../features/contracts/status.js';

const CLASS_MAP: Record<ContractDisplayStatus, string> = {
  sent: 'contract-badge contract-badge--pending',
  viewed: 'contract-badge contract-badge--partial',
  signed: 'contract-badge contract-badge--completed',
  expired: 'contract-badge contract-badge--expired',
  cancelled: 'contract-badge contract-badge--cancelled',
};

export default function ContractStatusBadge({ status }: { status: ContractDisplayStatus }) {
  return (
    <span className={CLASS_MAP[status] || CLASS_MAP.sent}>
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
