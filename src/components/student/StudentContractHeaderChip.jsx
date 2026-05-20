import React, { useMemo } from 'react';
import { FileSignature } from 'lucide-react';
import { useContractsList } from '../../features/contracts/queries.js';
import {
  mapContractDisplayStatusForRecord,
  contractHeaderChipLabel,
} from '../../features/contracts/status.js';

export default function StudentContractHeaderChip({ leadId, onOpenContractsTab }) {
  const { data } = useContractsList({
    leadId: leadId || undefined,
    limit: 1,
    page: 1,
  });

  const latest = useMemo(() => {
    const rows = data?.data || [];
    if (!rows.length) return null;
    const c = rows[0];
    const displayStatus = mapContractDisplayStatusForRecord(c);
    const signedAt =
      displayStatus === 'signed'
        ? c.updatedAt || c.createdAt
        : null;
    return {
      displayStatus,
      label: contractHeaderChipLabel(displayStatus, signedAt),
    };
  }, [data?.data]);

  if (!latest || !leadId) return null;

  return (
    <button
      type="button"
      className="student-contract-header-chip"
      onClick={() => onOpenContractsTab?.()}
      title="Abrir aba Contratos"
    >
      <FileSignature size={14} aria-hidden />
      {latest.label}
    </button>
  );
}
