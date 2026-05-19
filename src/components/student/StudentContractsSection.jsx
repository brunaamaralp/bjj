import React, { useMemo, useState } from 'react';
import { Plus, Eye, FileSignature } from 'lucide-react';
import { useContractsList } from '../../features/contracts/queries.js';
import { mapContractDisplayStatus } from '../../features/contracts/status.js';
import ContractStatusBadge from '../contracts/ContractStatusBadge.js';
import CreateContractModal from '../contracts/CreateContractModal.js';
import ContractDetailsDrawer from '../contracts/ContractDetailsDrawer.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export default function StudentContractsSection({ leadId }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError, error, refetch } = useContractsList({
    leadId: leadId || undefined,
    limit: 50,
    page: 1,
  });

  const rows = useMemo(() => {
    return (data?.data || []).map((c) => {
      const signersSigned = c.signersSigned ?? 0;
      const signersTotal = c.signersTotal ?? 0;
      return {
        ...c,
        displayStatus: mapContractDisplayStatus(c.status, signersSigned, signersTotal),
      };
    });
  }, [data?.data]);

  if (!leadId) return null;

  return (
    <div className="student-contracts-section">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-small text-muted" style={{ margin: 0 }}>
          Contratos digitais enviados para este aluno assinar via Autentique.
        </p>
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          Novo contrato
        </button>
      </div>

      {isLoading ? (
        <PageSkeleton variant="list" rows={3} />
      ) : isError ? (
        <ErrorBanner
          message={error instanceof Error ? error.message : 'Erro ao carregar contratos'}
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="embedded"
          title="Nenhum contrato ainda"
          description="Envie um contrato para o aluno assinar digitalmente."
          icon={FileSignature}
          primaryAction={{ label: 'Criar contrato', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <ul className="student-contracts-list">
          {rows.map((row) => (
            <li key={row.$id} className="student-contracts-item card">
              <div className="student-contracts-item-main">
                <strong>{row.name}</strong>
                <span className="text-small text-muted">{formatDate(row.createdAt)}</span>
              </div>
              <div className="student-contracts-item-actions">
                <ContractStatusBadge status={row.displayStatus} />
                <button type="button" className="btn-outline" onClick={() => setSelectedId(row.$id)}>
                  <Eye size={14} />
                  Ver detalhes
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateContractModal
        open={createOpen}
        leadId={leadId}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          refetch();
          setCreateOpen(false);
        }}
      />

      <ContractDetailsDrawer contractId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
