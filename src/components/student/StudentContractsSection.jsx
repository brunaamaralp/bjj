import React, { useMemo, useState } from 'react';
import '../contracts/contracts.css';
import { Plus, Eye, FileSignature } from 'lucide-react';
import { useContractsList } from '../../features/contracts/queries.js';
import {
  mapContractDisplayStatusForRecord,
  contractListStatusLabel,
} from '../../features/contracts/status.js';
import { isInactiveStudent } from '../../lib/studentStatus.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useStudentStore } from '../../store/useStudentStore.js';
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
  const [createPurpose, setCreatePurpose] = useState('enrollment');
  const [selectedId, setSelectedId] = useState(null);
  const leads = useLeadStore((s) => s.leads);
  const students = useStudentStore((s) => s.students);
  const lead = useMemo(() => {
    const id = String(leadId || '');
    if (!id) return null;
    const fromLeads = (leads || []).find((l) => String(l.id) === id);
    if (fromLeads) return fromLeads;
    return (students || []).find((s) => String(s.id) === id) || null;
  }, [leads, students, leadId]);
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
        <div className="student-contracts-section-actions">
          {studentInactive ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setCreatePurpose('rescission');
                setCreateOpen(true);
              }}
            >
              <Plus size={16} />
              Termo de rescisão
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setCreatePurpose('enrollment');
                  setCreateOpen(true);
                }}
              >
                <Plus size={16} />
                Novo contrato
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setCreatePurpose('rescission');
                  setCreateOpen(true);
                }}
              >
                Termo de rescisão
              </button>
            </>
          )}
        </div>
      </div>

      {studentInactive ? (
        <p className="text-small text-muted student-contracts-inactive-hint">
          Aluno desligado: novos contratos de matrícula estão bloqueados. Use &quot;Termo de rescisão&quot;
          para enviar o documento de desligamento. Contratos já enviados continuam sendo atualizados pela
          Autentique.
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
          description="Envie um contrato para o aluno assinar digitalmente. Se ele não assinar dentro do prazo da academia, o status ficará Expirado — use Reenviar (novo link) ou cancele e gere um novo contrato em Alunos → Contratos."
          icon={FileSignature}
          primaryAction={
            studentInactive
              ? {
                  label: 'Enviar termo de rescisão',
                  onClick: () => {
                    setCreatePurpose('rescission');
                    setCreateOpen(true);
                  },
                }
              : { label: 'Criar contrato', onClick: () => {
                  setCreatePurpose('enrollment');
                  setCreateOpen(true);
                } }
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
                <ContractStatusBadge
                  status={row.displayStatus}
                  label={contractListStatusLabel(row)}
                />
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
        purpose={createPurpose}
        allowInactiveStudent={createPurpose === 'rescission'}
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
