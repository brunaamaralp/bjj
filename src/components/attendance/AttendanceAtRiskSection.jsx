import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, Users } from 'lucide-react';
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
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import AttendanceRiskBadge from './AttendanceRiskBadge.jsx';
import AttendanceAbsenceReasonModal from './AttendanceAbsenceReasonModal.jsx';
import AttendanceAtRiskRowActions from './AttendanceAtRiskRowActions.jsx';
import DeactivateStudentModal from '../DeactivateStudentModal.jsx';
import './attendance-at-risk.css';

const URL_RET_TURMA = 'ret_turma';
const URL_RET_BELT = 'ret_belt';

function patchRetentionFilters(prev, { turma, belt }) {
  const next = new URLSearchParams(prev);
  const t = String(turma ?? '').trim();
  const b = String(belt ?? '').trim();
  if (t) next.set(URL_RET_TURMA, t);
  else next.delete(URL_RET_TURMA);
  if (b) next.set(URL_RET_BELT, b);
  else next.delete(URL_RET_BELT);
  return next;
}

function formatLastCheckin(iso) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '—';
  }
}

function KpiPill({ label, value, tone, featured = false }) {
  return (
    <div
      className={`attendance-at-risk-kpi attendance-at-risk-kpi--${tone}${featured ? ' attendance-at-risk-kpi--featured' : ''}`}
    >
      <span className="attendance-at-risk-kpi__value">{value}</span>
      <span className="attendance-at-risk-kpi__label">{label}</span>
    </div>
  );
}

function daysTone(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 8) return 'ok';
  if (n <= 14) return 'warn';
  return 'danger';
}

function StudentCell({ row }) {
  const meta = [row.turma, row.belt].filter(Boolean).join(' · ');
  return (
    <div className="attendance-at-risk-student">
      <Link to={`/student/${row.studentId}`} className="attendance-at-risk-name-link">
        {row.name || '—'}
      </Link>
      {meta ? <span className="attendance-at-risk-student__meta">{meta}</span> : null}
    </div>
  );
}

/**
 * Tabela operacional de alunos em risco por frequência (Recepção → Catraca).
 */
export default function AttendanceAtRiskSection({ className = '' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const turma = String(searchParams.get(URL_RET_TURMA) || '').trim();
  const belt = String(searchParams.get(URL_RET_BELT) || '').trim();

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
      const body = await fetchAttendanceRetention({
        academyId,
        turma: turma || undefined,
        belt: belt || undefined,
      });
      setData(body);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, turma, belt]);

  const setTurmaFilter = useCallback(
    (value) => {
      setSearchParams((prev) => patchRetentionFilters(prev, { turma: value, belt }), { replace: true });
    },
    [belt, setSearchParams]
  );

  const setBeltFilter = useCallback(
    (value) => {
      setSearchParams((prev) => patchRetentionFilters(prev, { turma, belt: value }), { replace: true });
    },
    [turma, setSearchParams]
  );

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
  const filterOptions = data?.filters || {};
  const turmaOptions = filterOptions.turmas || [];
  const beltOptions = filterOptions.belts || [];
  const queueCount = rows.length;
  const activeCount = summary?.active ?? 0;

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
      addToast({
        type: 'success',
        message: `${row.name} marcado como em contato. Sai da fila até novo check-in ou até limpar no perfil.`,
      });
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setActionBusyId('');
    }
  };

  const handleQuickSnooze = async (row, snoozeDays) => {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId || actionBusyId) return;
    setActionBusyId(studentId);
    setMenuOpenId('');
    try {
      const result = await postAttendanceRetentionAction({
        student_id: studentId,
        action: 'snooze',
        snooze_days: snoozeDays,
      });
      addToast({
        type: 'success',
        message: result?.snoozed_until
          ? `Oculto da fila até ${result.snoozed_until}.`
          : 'Aluno oculto da fila.',
      });
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
        render: (row) => <StudentCell row={row} />,
      },
      {
        key: 'daysWithoutCheckin',
        label: 'Dias sem treino',
        align: 'center',
        render: (row) => {
          const days = row.daysWithoutCheckin ?? '—';
          const tone = daysTone(row.daysWithoutCheckin);
          return (
            <span className={`attendance-at-risk-days attendance-at-risk-days--${tone}`}>
              {days}
            </span>
          );
        },
      },
      {
        key: 'lastCheckinAt',
        label: 'Último check-in',
        render: (row) => (
          <span className="attendance-at-risk-last-checkin">{formatLastCheckin(row.lastCheckinAt)}</span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <AttendanceRiskBadge status={row.status} label={row.statusLabel} />,
      },
      {
        key: 'actions',
        label: '',
        align: 'right',
        width: '120px',
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
              onQuickSnooze={handleQuickSnooze}
            />
          );
        },
      },
    ];

  return (
    <section
      id="retencao"
      className={`attendance-at-risk card reception-section${className ? ` ${className}` : ''}`}
    >
      <ReportSectionHeading
        className="attendance-at-risk__heading"
        title={
          <>
            <Users size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
            Retenção por frequência
          </>
        }
        subtitle={
          queueCount > 0
            ? `${queueCount} ${queueCount === 1 ? 'aluno precisa' : 'alunos precisam'} de contato de reativação`
            : 'Alunos em risco por ausência de check-in na catraca'
        }
        action={
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
        }
      />

      {summary ? (
        <div className="attendance-at-risk-kpis" role="status" aria-live="polite">
          {queueCount > 0 ? (
            <KpiPill label="Na fila" value={queueCount} tone="queue" featured />
          ) : null}
          <KpiPill label="Em risco" value={summary.at_risk ?? 0} tone="at-risk" />
          <KpiPill label="Sumidos" value={summary.absent ?? 0} tone="absent" />
          <KpiPill label="Novatos" value={summary.newcomer_at_risk ?? 0} tone="newcomer" />
          <KpiPill label="Ativos" value={activeCount} tone="active" />
        </div>
      ) : null}

      {data ? (
        <div className="attendance-at-risk-toolbar">
          <label className="attendance-at-risk-filter">
            <span>Turma</span>
            <select value={turma} onChange={(e) => setTurmaFilter(e.target.value)}>
              <option value="">Todas</option>
              {turma && !turmaOptions.includes(turma) ? (
                <option value={turma}>{turma}</option>
              ) : null}
              {turmaOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="attendance-at-risk-filter">
            <span>Faixa</span>
            <select value={belt} onChange={(e) => setBeltFilter(e.target.value)}>
              <option value="">Todas</option>
              {belt && !beltOptions.includes(belt) ? (
                <option value={belt}>{belt}</option>
              ) : null}
              {beltOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {(turma || belt) && queueCount > 0 ? (
            <p className="attendance-at-risk-toolbar__hint">
              Mostrando {queueCount} {queueCount === 1 ? 'aluno' : 'alunos'} com os filtros atuais
            </p>
          ) : null}
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
