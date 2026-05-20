import React, { useMemo, useState } from 'react';
import '../contracts/contracts.css';
import { Plus, Eye, FileSignature } from 'lucide-react';
import { useContractsList } from '../../features/contracts/queries.js';
import { mapContractDisplayStatusForRecord } from '../../features/contracts/status.js';
import { isInactiveStudent } from '../../lib/studentStatus.js';
import { useLeadStore } from '../../store/useLeadStore.js';
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
  const leads = useLeadStore((s) => s.leads);
  const lead = useMemo(
    () => (leads || []).find((l) => String(l.id) === String(leadId)),
    [leads, leadId]
  );
  const studentInactive = lead ? isInactiveStudent(lead) : false;

  const { data, isLoading, isError, error, refetch } = useContractsList({
    leadId: leadId || undefined,
    limit: 50,
    page: 1,
  });

  const rows = useMemo(() => {
    return (data?.data || []).map((c) => ({
      ...c,
      displayStatus: mapContractDisplayStatusForRecord(c),
    }));
  }, [data?.data]);

  if (!leadId) return null;

  return (
    <div className="student-contracts-section">
      <div className="student-contracts-section-head">
        <p className="text-small text-muted student-contracts-intro">
          Contratos digitais enviados para este aluno assinar via Autentique.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setCreateOpen(true)}
          disabled={studentInactive}
          title={studentInactive ? 'Aluno desligado — não é possível enviar novo contrato' : undefined}
        >
          <Plus size={16} />
          Novo contrato
        </button>
      </div>

      {studentInactive ? (
        <p className="text-small text-muted student-contracts-inactive-hint">
          Aluno desligado ou inativo: novos contratos estão bloqueados. Contratos já enviados continuam
          sendo atualizados pela Autentique.
        </p>
      ) : null}

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
          description="Envie um contrato para o aluno assinar digitalmente. Se ele não assinar dentro do prazo da academia, o status ficará Expirado — use Reenviar (novo link) ou cancele e gere um novo contrato na aba Contratos."
          icon={FileSignature}
          primaryAction={
            studentInactive
              ? undefined
              : { label: 'Criar contrato', onClick: () => setCreateOpen(true) }
          }
        />
      ) : (
        <ul className="student-contracts-list">
          {rows.map((row) => (
            <li key={row.$id} className="student-contracts-item card">
              <div className="student-contracts-item-main">
                <strong>{row.name}</strong>
                <span className="text-small text-muted">{formatDate(row.createdAt)}</span>
                {row.expiresAt ? (
                  <span className="text-small text-muted">Prazo: {formatDate(row.expiresAt)}</span>
                ) : null}
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

      <ContractDetailsDrawer
        contractId={selectedId}
        onClose={() => setSelectedId(null)}
        onResend={() => {
          setSelectedId(null);
          setCreateOpen(true);
        }}
        onCancelAndNew={() => {
          setSelectedId(null);
          setCreateOpen(true);
        }}
      />
    </div>
  );
}
