import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useWhatsappTemplates } from '../../lib/useWhatsappTemplates.js';
import { fetchAttendanceRetention, postAttendanceRetentionAction } from '../../lib/attendanceRetentionApi.js';
import { sendWhatsappTemplateOutbound } from '../../lib/outboundWhatsappTemplate.js';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { ATTENDANCE_RETENTION_EVENT_TYPES } from '../../../lib/attendanceRetentionCore.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { deactivateStudent } from '../../lib/deactivateStudent.js';
import { getAcademyDocument } from '../../lib/getAcademyDocument.js';
import { readStudentExitReasonsFromAcademyDoc } from '../../lib/studentExitConfig.js';
import { useStudentStore } from '../../store/useStudentStore.js';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ReportDataTable from '../reports/shared/ReportDataTable.jsx';
import AttendanceRiskBadge from './AttendanceRiskBadge.jsx';
import AttendanceAbsenceReasonModal from './AttendanceAbsenceReasonModal.jsx';
import AttendanceAtRiskRowActions from './AttendanceAtRiskRowActions.jsx';
import DeactivateStudentModal from '../DeactivateStudentModal.jsx';
import './attendance-at-risk.css';

function formatLastCheckin(iso) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '—';
  }
}

function KpiPill({ label, value, tone }) {
  return (
    <div className={`attendance-at-risk-kpi attendance-at-risk-kpi--${tone}`}>
      <span className="attendance-at-risk-kpi__value">{value}</span>
      <span className="attendance-at-risk-kpi__label">{label}</span>
    </div>
  );
}

/**
 * Tabela operacional de alunos em risco por frequência (Recepção → Catraca).
 */
export default function AttendanceAtRiskSection({ className = '' }) {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const userId = useLeadStore((s) => s.userId);
  const mergeStudent = useStudentStore((s) => s.mergeStudent);
  const addToast = useUiStore((s) => s.addToast);

  const { templates, academyName, zapsterInstanceId } = useWhatsappTemplates(academyId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [waBusyId, setWaBusyId] = useState('');
  const [waSentIds, setWaSentIds] = useState(() => new Set());
  const [actionBusyId, setActionBusyId] = useState('');
  const [absenceRow, setAbsenceRow] = useState(null);
  const [deactivateRow, setDeactivateRow] = useState(null);
  const [exitReasons, setExitReasons] = useState([]);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState('');

  const permissionContext = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId) || {};
    return { teamId: acad.teamId, userId: userId || '' };
  }, [academyList, academyId, userId]);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchAttendanceRetention({ academyId });
      setData(body);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!academyId) return;
    void getAcademyDocument(academyId)
      .then((doc) => setExitReasons(readStudentExitReasonsFromAcademyDoc(doc)))
      .catch(() => setExitReasons(readStudentExitReasonsFromAcademyDoc(null)));
  }, [academyId]);

  const rows = data?.at_risk || [];
  const summary = data?.summary;

  const handleWhatsApp = async (row) => {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId || waBusyId) return;
    setWaBusyId(studentId);
    try {
      const lead = { id: studentId, name: row.name, phone: row.phone };
      const result = await sendWhatsappTemplateOutbound({
        lead,
        academyId,
        academyName,
        templateKey: 'recovery',
        templatesMap: templates || {},
        zapsterInstanceId,
        onToast: (t) => addToast(t),
        permissionContext,
        createdBy: userId || 'user',
      });
      if (result?.ok) {
        setWaSentIds((prev) => new Set(prev).add(studentId));
        await addLeadEvent({
          academyId,
          leadId: studentId,
          type: ATTENDANCE_RETENTION_EVENT_TYPES.REACTIVATION_WHATSAPP,
          text: 'Mensagem de reativação enviada (frequência)',
          createdBy: userId || 'user',
          permissionContext,
          payloadJson: { source: 'attendance_retention', templateKey: 'recovery' },
        }).catch(() => {});
      }
    } finally {
      setWaBusyId('');
    }
  };

  const handleMarkContact = async (row) => {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId || actionBusyId) return;
    setActionBusyId(studentId);
    try {
      await postAttendanceRetentionAction({ student_id: studentId, action: 'mark_contact' });
      addToast({ type: 'success', message: `${row.name} marcado como em contato.` });
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setActionBusyId('');
    }
  };

  const handleAbsenceConfirm = async ({ reason, notes, snoozeDays }) => {
    if (!absenceRow) return;
    const studentId = String(absenceRow.studentId || '').trim();
    setActionBusyId(studentId);
    try {
      const result = await postAttendanceRetentionAction({
        student_id: studentId,
        action: 'absence_reason',
        reason,
        notes,
        snooze_days: snoozeDays,
      });
      const until = result?.snoozed_until;
      addToast({
        type: 'success',
        message: until
          ? `Ausência registrada. Oculto da fila até ${until}.`
          : 'Motivo de ausência registrado.',
      });
      setAbsenceRow(null);
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setActionBusyId('');
    }
  };

  const handleDeactivateConfirm = async (payload) => {
    if (!deactivateRow) return;
    const studentId = String(deactivateRow.studentId || '').trim();
    setDeactivateBusy(true);
    try {
      await deactivateStudent({
        student: { id: studentId, name: deactivateRow.name, phone: deactivateRow.phone },
        leadId: studentId,
        academyId,
        exitReason: payload.exitReason,
        exitDate: payload.exitDate,
        exitNotes: payload.exitNotes,
        cancelFuturePayments: payload.cancelFuturePayments,
        mergeStudent,
      });
      addToast({ type: 'success', message: 'Matrícula encerrada.' });
      setDeactivateRow(null);
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setDeactivateBusy(false);
    }
  };

  const columns = [
      {
        key: 'name',
        label: 'Aluno',
        render: (row) => (
          <Link to={`/student/${row.studentId}`} className="attendance-at-risk-name-link">
            {row.name || '—'}
          </Link>
        ),
      },
      {
        key: 'daysWithoutCheckin',
        label: 'Dias sem treino',
        align: 'center',
        render: (row) => <strong>{row.daysWithoutCheckin ?? '—'}</strong>,
      },
      {
        key: 'lastCheckinAt',
        label: 'Último check-in',
        render: (row) => formatLastCheckin(row.lastCheckinAt),
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <AttendanceRiskBadge status={row.status} label={row.statusLabel} />,
      },
      {
        key: 'actions',
        label: 'Ações',
        align: 'right',
        render: (row) => {
          const sid = String(row.studentId || '');
          return (
            <AttendanceAtRiskRowActions
              row={row}
              waLoading={waBusyId === sid}
              waSent={waSentIds.has(sid)}
              rowBusy={actionBusyId === sid}
              menuOpen={menuOpenId}
              onMenuOpenChange={setMenuOpenId}
              onWhatsApp={handleWhatsApp}
              onAbsence={setAbsenceRow}
              onMarkContact={handleMarkContact}
              onDeactivate={setDeactivateRow}
            />
          );
        },
      },
    ];

  return (
    <section className={`attendance-at-risk card reception-section${className ? ` ${className}` : ''}`}>
      <div className="reception-section-head attendance-at-risk__head">
        <div>
          <h2 className="reception-section-heading">
            <AlertTriangle size={16} aria-hidden />
            Retenção por frequência
          </h2>
          <p className="reception-section-lead">
            Alunos em risco por ausência de check-in — priorize contato de reativação.
          </p>
        </div>
        <button
          type="button"
          className="btn-outline attendance-at-risk__refresh"
          disabled={loading}
          onClick={() => void load()}
          aria-label="Atualizar lista"
        >
          <RefreshCw size={14} className={loading ? 'attendance-at-risk-spin' : ''} aria-hidden />
          Atualizar
        </button>
      </div>

      {summary ? (
        <div className="attendance-at-risk-kpis" role="status" aria-live="polite">
          <KpiPill label="Ativos" value={summary.active ?? 0} tone="active" />
          <KpiPill label="Em risco" value={summary.at_risk ?? 0} tone="at-risk" />
          <KpiPill label="Sumidos" value={summary.absent ?? 0} tone="absent" />
          <KpiPill label="Novatos" value={summary.newcomer_at_risk ?? 0} tone="newcomer" />
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && !data ? (
        <p className="attendance-at-risk-loading">Carregando alunos em risco…</p>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          insideCard
          variant="compact"
          tone="dashed"
          title="Nenhum aluno em risco agora"
          description="Quando alguém ficar 8+ dias sem treinar, aparece aqui."
        />
      ) : null}

      {rows.length > 0 ? (
        <ReportDataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyMessage="Nenhum aluno em risco."
          getRowClassName={(row) => `attendance-at-risk-row attendance-at-risk-row--${row.status}`}
          wrapClassName="attendance-at-risk-table-wrap"
        />
      ) : null}

      {data?.attendanceTruncated ? (
        <p className="attendance-at-risk-truncated" role="status">
          Histórico de presença truncado — valores podem estar incompletos para academias com muito volume.
        </p>
      ) : null}

      <AttendanceAbsenceReasonModal
        open={Boolean(absenceRow)}
        studentName={absenceRow?.name}
        busy={Boolean(actionBusyId)}
        onCancel={() => setAbsenceRow(null)}
        onConfirm={handleAbsenceConfirm}
      />

      {deactivateRow ? (
        <DeactivateStudentModal
          studentName={deactivateRow.name}
          exitReasons={exitReasons}
          busy={deactivateBusy}
          onCancel={() => setDeactivateRow(null)}
          onConfirm={handleDeactivateConfirm}
        />
      ) : null}
    </section>
  );
}
