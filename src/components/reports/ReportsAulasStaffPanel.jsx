import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import { fetchLessonStaffReport } from '../../lib/lessonStaffApi.js';
import { createSessionJwt } from '../../lib/appwrite.js';
import { authedFetch } from '../../lib/authInterceptor.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import { buildLessonStaffCsvRows } from '../../../lib/lessonStaffRegister.js';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { normalizeReportsOperatorTeam } from '../../lib/reportsOperatorTeam.js';
import { useStaffRosterStore, isStaffRosterConfigured } from '../../store/staffRosterStore.js';
import { buildLessonStaffPickerOptions } from '../../../lib/staffRoster.js';
import { useToast } from '../../hooks/useToast.js';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import './reports.css';

async function downloadLessonStaffPdf({ from, to, userId }) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = String(useLeadStore.getState().academyId || '').trim();
  if (!academyId) throw new Error('academy_required');
  const q = new URLSearchParams({ from, to, format: 'pdf' });
  if (userId) q.set('user_id', userId);
  const res = await authedFetch(`/api/leads?route=bookings&action=lesson-staff-report&${q}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': academyId,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.erro || data.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aulas-staff-${from}_${to}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {{ academyId: string, rangeFrom: string, rangeTo: string, periodLabel?: string }} props
 */
export default function ReportsAulasStaffPanel({
  academyId,
  rangeFrom,
  rangeTo,
  periodLabel = '',
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [userId, setUserId] = useState('');
  const [team, setTeam] = useState([]);
  const [exporting, setExporting] = useState(false);
  const roster = useStaffRosterStore((s) => s.roster);
  const fetchRoster = useStaffRosterStore((s) => s.fetchRoster);

  useEffect(() => {
    if (!academyId) return;
    fetchTeamMemberships(academyId)
      .then((data) => setTeam(normalizeReportsOperatorTeam(data)))
      .catch(() => setTeam([]));
  }, [academyId]);

  useEffect(() => {
    if (!academyId || !isStaffRosterConfigured()) return;
    void fetchRoster(academyId, { activeOnly: true });
  }, [academyId, fetchRoster]);

  const filterOptions = useMemo(
    () => buildLessonStaffPickerOptions({ teamMembers: team, roster }),
    [team, roster]
  );

  const load = useCallback(async () => {
    if (!academyId || !rangeFrom || !rangeTo) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchLessonStaffReport({
        from: rangeFrom,
        to: rangeTo,
        userId: userId || undefined,
      });
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [academyId, rangeFrom, rangeTo, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalsRows = useMemo(() => report?.totals || [], [report]);

  const exportCsv = () => {
    const rows = buildLessonStaffCsvRows(report?.detail || []);
    if (!rows.length) {
      toast.warning('Nenhuma aula confirmada/cancelada no período para exportar.');
      return;
    }
    downloadCsv(rows, `aulas-staff-${rangeFrom}_${rangeTo}.csv`);
    toast.success('CSV exportado.');
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadLessonStaffPdf({
        from: rangeFrom,
        to: rangeTo,
        userId: userId || undefined,
      });
      toast.success('PDF exportado.');
    } catch (e) {
      toast.error(friendlyError(e, 'export'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ReportsPanelShell>
      <ReportSectionHeading
        title="Aulas (equipe)"
        subtitle={
          periodLabel
            ? `Aulas confirmadas por professor e instrutor · ${periodLabel}`
            : 'Aulas confirmadas por professor e instrutor'
        }
      />

      <div className="reports-freq-toolbar navi-toolbar">
        <label className="reports-freq-filter">
          <span className="reports-freq-filter__label">Colaborador</span>
          <select
            className="form-input navi-control--toolbar reports-freq-filter__select"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
          <option value="">Todos</option>
          {filterOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-outline navi-btn--toolbar"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
        <button type="button" className="btn-outline navi-btn--toolbar" onClick={exportCsv} disabled={loading}>
          <Download size={16} /> CSV
        </button>
        <button
          type="button"
          className="btn-primary navi-btn--toolbar"
          onClick={() => void exportPdf()}
          disabled={loading || exporting}
        >
          {exporting ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
          {exporting ? 'Exportando…' : 'PDF'}
        </button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && !report ? (
        <p className="text-muted">Carregando…</p>
      ) : (
        <>
          <div className="reports-kpi-grid" style={{ marginBottom: 20 }}>
            <ReportKpiCard label="Confirmadas" value={report?.confirmed_count ?? 0} />
            <ReportKpiCard label="Não houve" value={report?.cancelled_count ?? 0} />
            <ReportKpiCard label="Colaboradores" value={totalsRows.length} />
          </div>

          <ReportsPanelSection title="Totais por colaborador">
            {!totalsRows.length ? (
              <EmptyState
                variant="compact"
                tone="dashed"
                title="Sem aulas confirmadas no período"
                description="Na Recepção, confirme a equipe nas aulas da grade para alimentar este relatório."
              />
            ) : (
              <ReportDataTable
                columns={[
                  { key: 'name', label: 'Colaborador' },
                  { key: 'as_professor', label: 'Como professor' },
                  { key: 'as_instructor', label: 'Como instrutor' },
                ]}
                rows={totalsRows}
              />
            )}
          </ReportsPanelSection>
        </>
      )}
    </ReportsPanelShell>
  );
}
