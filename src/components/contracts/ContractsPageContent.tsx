import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, FileSignature, RefreshCw, FileText } from 'lucide-react';
import { useContractsList } from '../../features/contracts/queries.js';
import { mapContractDisplayStatusForRecord, CONTRACT_STATUS_FILTER_OPTIONS } from '../../features/contracts/status.js';
import type { ContractListItem, ContractDisplayStatus } from '../../features/contracts/types.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUserRole } from '../../lib/useUserRole.js';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ContractsTable from './ContractsTable.js';
import CreateContractModal from './CreateContractModal.js';
import ContractDetailsDrawer from './ContractDetailsDrawer.js';
import ContractLeadFilter from './ContractLeadFilter.js';
import EmptyState from '../shared/EmptyState.jsx';
import './contracts.css';
import { friendlyError } from '../../lib/errorMessages.js';

const PAGE_SIZE = 20;

type ContractsPageContentProps = { embedded?: boolean };

export default function ContractsPageContent({ embedded = false }: ContractsPageContentProps) {
  const leads = useLeadStore((s) => s.leads);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);
  const [statusFilter, setStatusFilter] = useState<'all' | ContractDisplayStatus>('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leadFilterId, setLeadFilterId] = useState('');
  const [leadFilterLabel, setLeadFilterLabel] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useContractsList({
    status: statusFilter,
    leadId: leadFilterId || undefined,
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
    return raw.map((c) => {
      const signersSigned = c.signersSigned ?? 0;
      const signersTotal = c.signersTotal ?? 0;
      const displayStatus = mapContractDisplayStatusForRecord(c);
      return {
        ...c,
        signersSigned,
        signersTotal,
        displayStatus,
        studentName: c.leadId ? leadNameById.get(c.leadId) || null : null,
      };
    });
  }, [data?.data, leadNameById]);

  const filterOptions = useMemo(
    () =>
      CONTRACT_STATUS_FILTER_OPTIONS.map((o) => ({
        id: o.id,
        label: o.label,
        count: o.id === 'all' ? data?.total : undefined,
      })),
    [data?.total]
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = statusFilter !== 'all' || Boolean(leadFilterId);
  const showEmptyCta = !isLoading && !isError && total === 0 && !hasActiveFilters;

  const actionButtons = (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        className="btn-outline"
        onClick={() => refetch()}
        disabled={isFetching}
        title="Atualizar lista (útil se o webhook ainda não estiver configurado)"
      >
        <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
        Atualizar
      </button>
      {navRole === 'owner' ? (
        <Link to="/empresa?tab=contratos" className="btn-outline flex items-center gap-1">
          <FileText size={14} />
          Modelos
        </Link>
      ) : null}
      <button type="button" className="btn-primary contracts-new-btn" onClick={() => setCreateOpen(true)}>
        <Plus size={18} />
        Novo contrato
      </button>
    </div>
  );

  return (
    <div className={embedded ? 'contracts-page contracts-page--embedded' : 'container contracts-page'}>
      {embedded ? (
        <div className="contracts-page-actions animate-in">{actionButtons}</div>
      ) : (
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
          {actionButtons}
        </div>
      )}

      <div className="contracts-toolbar card contracts-toolbar--split">
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
        <ContractLeadFilter
          leadId={leadFilterId}
          leadLabel={leadFilterLabel}
          onChange={(id, label) => {
            setLeadFilterId(id);
            setLeadFilterLabel(label);
            setPage(1);
          }}
        />
      </div>

      <div className="contracts-panel card">
        {isLoading ? (
          <PageSkeleton variant="table" rows={6} columns={6} />
        ) : isError ? (
          <ErrorBanner
            message={friendlyError(error, 'load')}
            onRetry={() => refetch()}
          />
        ) : showEmptyCta ? (
          <EmptyState
            variant="embedded"
            title="Nenhum contrato ainda"
            description="Crie e envie contratos digitais para seus alunos assinarem."
            icon={FileSignature}
            primaryAction={{ label: 'Criar primeiro contrato', onClick: () => setCreateOpen(true) }}
          />
        ) : (
          <ContractsTable rows={rows} onOpen={setSelectedId} filtered={hasActiveFilters} />
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
