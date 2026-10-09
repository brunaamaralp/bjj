import '../styles/professores.css';
import '../components/reports/reports.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
import { useInventoryStore } from '../store/useInventoryStore';
import { useAcademyRoleDoc } from '../hooks/useAcademyRoleDoc.js';
import { useCanManageStudentPayments } from '../lib/canManageStudentPayments.js';
import { useToast } from '../hooks/useToast';
import { useExperimentalProfessorOptions } from '../hooks/useExperimentalProfessorOptions.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import ProfessoresHub from '../components/professores/ProfessoresHub.jsx';
import ProfessorClosingSheet from '../components/professores/ProfessorClosingSheet.jsx';
import ProfessorCompensationConfig from '../components/professores/ProfessorCompensationConfig.jsx';
import ProfessorProductWithdrawModal from '../components/professores/ProfessorProductWithdrawModal.jsx';
import { fetchProfessorClosingMonth } from '../lib/professorClosingApi.js';
import { DEFAULT_PRODUCT_DISCOUNT_PCT } from '../../lib/professorCompensation.js';
import { refreshStockStores } from '../lib/syncStockStores';

function currentYearMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function normalizeMonthParam(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return currentYearMonth();
}

export default function Professores() {
  const academyId = useLeadStore((s) => s.academyId);
  const modules = useLeadStore((s) => s.modules);
  const academyDoc = useAcademyRoleDoc();
  const canManage = useCanManageStudentPayments(academyDoc);
  const canWithdraw = modules?.inventory === true;
  const toast = useToast();
  const staffOptions = useExperimentalProfessorOptions(academyId);
  const inventoryItems = useInventoryStore((s) => s.items);
  const loadItems = useInventoryStore((s) => s.loadItems);
  const inventoryMove = useInventoryStore((s) => s.inventoryMove);

  const [searchParams, setSearchParams] = useSearchParams();
  const month = normalizeMonthParam(searchParams.get('month'));
  const staffParam = String(searchParams.get('staff') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [compensation, setCompensation] = useState(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawStaffRef, setWithdrawStaffRef] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const setQuery = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => {
            const val = String(v ?? '').trim();
            if (!val) next.delete(k);
            else next.set(k, val);
          });
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const load = useCallback(async () => {
    if (!academyId || !month) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchProfessorClosingMonth(month, academyId);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setCompensation(data.compensation || null);
    } catch (e) {
      setRows([]);
      setError(e?.message || 'Erro ao carregar fechamento');
    } finally {
      setLoading(false);
    }
  }, [academyId, month]);

  useEffect(() => {
    const raw = String(searchParams.get('month') || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) {
      setQuery({ month: currentYearMonth() });
    }
  }, [searchParams, setQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canWithdraw || !academyId) return;
    void loadItems();
  }, [canWithdraw, academyId, loadItems]);

  const selectedRow = useMemo(
    () => rows.find((r) => String(r.staff_ref) === staffParam) || null,
    [rows, staffParam]
  );

  const discountPct =
    compensation?.product_discount_pct != null
      ? Number(compensation.product_discount_pct)
      : DEFAULT_PRODUCT_DISCOUNT_PCT;

  const openWithdraw = (rowOrRef) => {
    const ref =
      typeof rowOrRef === 'string'
        ? rowOrRef
        : String(rowOrRef?.staff_ref || staffParam || '').trim();
    setWithdrawStaffRef(ref);
    setWithdrawOpen(true);
  };

  const submitWithdraw = async (payload) => {
    setWithdrawBusy(true);
    try {
      const result = await inventoryMove(payload);
      if (!result) {
        throw new Error(useInventoryStore.getState().error || 'Erro na retirada');
      }
      toast.success('Retirada registrada.');
      await refreshStockStores();
      await load();
    } finally {
      setWithdrawBusy(false);
    }
  };

  if (!academyId) {
    return (
      <div className="container navi-hub-page">
        <div className="navi-hub-page__head">
          <PageHeader
            title="Professores"
            subtitle="Fechamento mensal de aulas, experimentais e retiradas."
          />
        </div>
        <p className="text-small text-muted">Selecione uma academia para ver o fechamento.</p>
      </div>
    );
  }

  return (
    <div className="container navi-hub-page">
      <div className="navi-hub-page__head">
        <PageHeader
          title="Professores"
          subtitle="Feche o mês por professor ou instrutor: créditos, débitos e pagamento."
        />
      </div>

      <div className="navi-hub-page__body professores-page">
        {error ? (
          <ErrorBanner message={error} onRetry={() => void load()} />
        ) : null}

        {canManage ? (
          <ProfessorCompensationConfig
            academyId={academyId}
            compensation={compensation}
            staffOptions={staffOptions}
            onSaved={async () => {
              await load();
            }}
            toast={toast}
          />
        ) : null}

        {staffParam && selectedRow ? (
          <ProfessorClosingSheet
            row={selectedRow}
            month={month}
            academyId={academyId}
            canManage={canManage}
            canWithdraw={canWithdraw}
            onClose={() => setQuery({ staff: '' })}
            onChanged={load}
            onWithdraw={openWithdraw}
            toast={toast}
          />
        ) : staffParam && !loading && !selectedRow ? (
          <ErrorBanner
            message="Colaborador não encontrado neste mês."
            action={{ label: 'Voltar à lista', onClick: () => setQuery({ staff: '' }) }}
          />
        ) : loading && rows.length === 0 ? (
          <PageSkeleton variant="table" rows={6} columns={6} />
        ) : (
          <ProfessoresHub
            month={month}
            onMonthChange={(ym) => setQuery({ month: ym, staff: '' })}
            rows={rows}
            loading={loading}
            selectedStaffRef={staffParam}
            onSelectStaff={(ref) => setQuery({ month, staff: ref })}
            toolbarExtra={
              canWithdraw ? (
                <button type="button" className="btn-outline" onClick={() => openWithdraw('')}>
                  Retirada de produto
                </button>
              ) : null
            }
          />
        )}
      </div>

      {canWithdraw ? (
        <ProfessorProductWithdrawModal
          open={withdrawOpen}
          onClose={() => {
            if (!withdrawBusy) setWithdrawOpen(false);
          }}
          staffOptions={staffOptions}
          products={inventoryItems}
          discountPct={discountPct}
          initialStaffRef={withdrawStaffRef}
          loading={withdrawBusy}
          onSubmit={submitWithdraw}
        />
      ) : null}
    </div>
  );
}
