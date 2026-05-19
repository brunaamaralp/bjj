import React, { useMemo, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, FileSignature } from 'lucide-react';
import { useContractsList } from '../../features/contracts/queries.js';
import { mapContractDisplayStatus, CONTRACT_STATUS_FILTER_OPTIONS } from '../../features/contracts/status.js';
import type { ContractListItem, ContractDisplayStatus } from '../../features/contracts/types.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ContractsTable from './ContractsTable.js';
import CreateContractModal from './CreateContractModal.js';
import ContractDetailsDrawer from './ContractDetailsDrawer.js';
import './contracts.css';

const PAGE_SIZE = 20;

export default function ContractsPageContent() {
  const leads = useLeadStore((s) => s.leads);
  const [statusFilter, setStatusFilter] = useState<'all' | ContractDisplayStatus>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useContractsList({
    page,
    limit: PAGE_SIZE,
  });

  const leadNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads || []) {
      if (l.id && l.name) map.set(String(l.id), String(l.name));
    }
    return map;
  }, [leads]);

  const rows: ContractListItem[] = useMemo(() => {
    const raw = data?.data || [];
    return raw
      .map((c) => {
        const signersSigned = c.signersSigned ?? 0;
        const signersTotal = c.signersTotal ?? 0;
        const displayStatus = mapContractDisplayStatus(c.status, signersSigned, signersTotal);
        return {
          ...c,
          signersSigned,
          signersTotal,
          displayStatus,
          studentName: c.leadId ? leadNameById.get(c.leadId) || null : null,
        };
      })
      .filter((c) => statusFilter === 'all' || c.displayStatus === statusFilter);
  }, [data?.data, leadNameById, statusFilter]);

  const filterOptions = useMemo(
    () =>
      CONTRACT_STATUS_FILTER_OPTIONS.map((o) => ({
        id: o.id,
        label: o.label,
        count: o.id === 'all' ? data?.total : rows.filter((r) => r.displayStatus === o.id).length,
      })),
    [data?.total, rows]
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="container contracts-page">
      <div className="contracts-page-header animate-in">
        <div>
          <h1 className="navi-page-title flex items-center gap-2">
            <FileSignature size={26} strokeWidth={1.75} aria-hidden />
            Contratos digitais
          </h1>
          <p className="navi-eyebrow" style={{ marginTop: 6 }}>
            Envie contratos para assinatura via Autentique e acompanhe o status
          </p>
        </div>
        <button type="button" className="btn-primary contracts-new-btn" onClick={() => setCreateOpen(true)}>
          <Plus size={18} />
          Novo contrato
        </button>
      </div>

      <div className="contracts-toolbar card">
        <CompactStatusFilter
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v as 'all' | ContractDisplayStatus);
            setPage(1);
          }}
          options={filterOptions}
          placeholder="Filtrar por status"
          showCounts={false}
        />
      </div>

      <div className="contracts-panel card">
        {isLoading ? (
          <PageSkeleton variant="table" rows={6} columns={6} />
        ) : isError ? (
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Não foi possível carregar os contratos'}
            onRetry={() => refetch()}
          />
        ) : (
          <ContractsTable rows={rows} onOpen={setSelectedId} />
        )}
      </div>

      {!isLoading && !isError && total > 0 ? (
        <div className="contracts-pagination">
          <button
            type="button"
            className="btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
            Anterior
          </button>
          <span className="text-small text-muted">
            Página {page} de {totalPages} · {total} contrato{total === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="btn-outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}

      <CreateContractModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          refetch();
          setPage(1);
        }}
      />

      <ContractDetailsDrawer contractId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
