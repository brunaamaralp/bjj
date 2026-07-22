import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Info, RefreshCw, Users } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useWhatsappTemplates } from '../../lib/useWhatsappTemplates.js';
import { createCheckin, isAttendanceConfigured } from '../../lib/attendance.js';
import { fetchAttendanceRetention, postAttendanceRetentionAction } from '../../lib/attendanceRetentionApi.js';
import { sendWhatsappTemplateOutbound } from '../../lib/outboundWhatsappTemplate.js';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { ATTENDANCE_RETENTION_EVENT_TYPES, normalizeAttendanceRiskStatus } from '../../../lib/attendanceRetentionCore.js';
import { attendanceRetentionKpiTooltips } from '../../lib/attendanceRetentionKpiTooltips.js';
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
import { useTerms } from '../../lib/terminology.js';
import { emitLeadAttendanceChanged } from '../../lib/leadTimelineEvents.js';
import { useSessionUser } from '../../hooks/useSessionUser.js';
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

function KpiPill({ label, value, tone, featured = false, tooltip = null }) {
  return (
    <div
      className={`attendance-at-risk-kpi attendance-at-risk-kpi--${tone}${featured ? ' attendance-at-risk-kpi--featured' : ''}`}
    >
      <span className="attendance-at-risk-kpi__value">{value}</span>
      <span className="attendance-at-risk-kpi__label">
        {label}
        {tooltip ? (
          <button
            type="button"
            className="attendance-at-risk-kpi__info"
            aria-label={`Definição: ${label}`}
            title={tooltip}
            onClick={(e) => e.stopPropagation()}
          >
            <Info size={12} aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function daysTone(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 8) return 'ok';
  if (n <= 14) return 'warn';
  return 'danger';
}

function weeklyTone(row) {
  const expected = Number(row.weeklyCheckinsExpected) || 2;
  const count = Number(row.checkinsLast7Days) || 0;
  if (count >= expected) return 'ok';
  if (count > 0) return 'warn';
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
export default function AttendanceAtRiskSection({ className = '', layout = 'full', onDataLoaded }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const { firstName: sessionUserName } = useSessionUser();
  const attendanceReady = isAttendanceConfigured();
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
  const [checkinBusyId, setCheckinBusyId] = useState('');
  const [waSentIds, setWaSentIds] = useState(() => new Set());
  const [actionBusyId, setActionBusyId] = useState('');
  const [absenceRow, setAbsenceRow] = useState(null);
  const [deactivateRow, setDeactivateRow] = useState(null);
  const [exitReasons, setExitReasons] = useState([]);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState('');

  // Evita loop: pai costuma passar callback inline; não pode entrar nas deps do load.
  const onDataLoadedRef = useRef(onDataLoaded);
  onDataLoadedRef.current = onDataLoaded;

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
      onDataLoadedRef.current?.(body);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
      onDataLoadedRef.current?.(null);
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
  const kpiTooltips = useMemo(() => attendanceRetentionKpiTooltips(), []);

  const handleCheckin = async (row) => {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId || checkinBusyId || !academyId || !attendanceReady) return;
    setCheckinBusyId(studentId);
    try {
      await createCheckin(
        {
          lead_id: studentId,
          academy_id: academyId,
          checked_in_by: userId || 'user',
          checked_in_by_name: sessionUserName || 'Usuário',
        },
        permissionContext
      );
      addToast({
        type: 'success',
        message: `${terms.attendance} registrada para ${row.name || 'aluno'}.`,
      });
      emitLeadAttendanceChanged(studentId);
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setCheckinBusyId('');
    }
  };

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
        suppressToasts: true,
        permissionContext,
        createdBy: userId || 'user',
      });
      if (result?.ok) {
        setWaSentIds((prev) => new Set(prev).add(studentId));
        addToast({ type: 'success', message: 'Mensagem de reativação enviada!' });
        await addLeadEvent({
          academyId,
          leadId: studentId,
          type: ATTENDANCE_RETENTION_EVENT_TYPES.REACTIVATION_WHATSAPP,
          text: 'Mensagem de reativação enviada (frequência)',
          createdBy: userId || 'user',
          permissionContext,
          payloadJson: { source: 'attendance_retention', templateKey: 'recovery' },
        }).catch(() => {});
      } else if (result?.reason === 'no_recent_interaction') {
        const digits = String(row.phone || '').replace(/\D/g, '');
        addToast({
          type: 'warning',
          message:
            result.error ||
            'Sem conversa recente no WhatsApp. Envie manualmente pelo Inbox.',
          action: digits
            ? {
                label: 'Abrir Inbox',
                onClick: () => navigate(`/inbox?phone=${encodeURIComponent(digits)}`),
              }
            : undefined,
        });
      } else {
        addToast({
          type: 'error',
          message: result?.error || 'Não foi possível enviar o WhatsApp de reativação.',
        });
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
        key: 'checkinsLast7Days',
        label: 'Semana',
        align: 'center',
        render: (row) => {
          const expected = row.weeklyCheckinsExpected ?? 2;
          const count = row.checkinsLast7Days ?? 0;
          const tone = weeklyTone(row);
          return (
            <span className={`attendance-at-risk-days attendance-at-risk-days--${tone}`} title={`Meta: ${expected}/sem`}>
              {count}/{expected}
            </span>
          );
        },
      },
      {
        key: 'daysWithoutCheckin',
        label: 'Dias s/ treino',
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
        width: '156px',
        render: (row) => {
          const sid = String(row.studentId || '');
          return (
            <AttendanceAtRiskRowActions
              row={row}
              showCheckin={attendanceReady}
              checkinLoading={checkinBusyId === sid}
              onCheckin={handleCheckin}
              waLoading={waBusyId === sid}
              waSent={waSentIds.has(sid)}
              rowBusy={actionBusyId === sid || checkinBusyId === sid}
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
      className={`attendance-at-risk card reception-section${
        layout === 'sidebar' ? ' attendance-at-risk--sidebar' : ''
      }${className ? ` ${className}` : ''}`}
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
            : 'Classificação por meta semanal de check-ins (plano ou turma)'
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

      {summary && layout !== 'sidebar' ? (
        <div className="attendance-at-risk-kpis" role="status" aria-live="polite">
          <KpiPill
            label="Em risco"
            value={summary.at_risk ?? 0}
            tone="at-risk"
            tooltip={kpiTooltips.at_risk}
          />
          <KpiPill
            label="Sumidos"
            value={summary.absent ?? 0}
            tone="absent"
            tooltip={kpiTooltips.absent}
          />
          <KpiPill
            label="Ativos"
            value={activeCount}
            tone="active"
            tooltip={kpiTooltips.active}
          />
        </div>
      ) : null}

      {data ? (
        <div className="attendance-at-risk-toolbar navi-toolbar">
          <label className="attendance-at-risk-filter">
            <span className="attendance-at-risk-filter__label">Turma</span>
            <select
              className="form-input navi-control--toolbar attendance-at-risk-filter__select"
              value={turma}
              onChange={(e) => setTurmaFilter(e.target.value)}
            >
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
            <span className="attendance-at-risk-filter__label">{terms.belt}</span>
            <select
              className="form-input navi-control--toolbar attendance-at-risk-filter__select"
              value={belt}
              onChange={(e) => setBeltFilter(e.target.value)}
            >
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
          description="Quando alguém ficar abaixo da meta semanal ou sumir por 15+ dias, aparece aqui."
        />
      ) : null}

      {rows.length > 0 ? (
        <ReportDataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyMessage="Nenhum aluno em risco."
          getRowClassName={(row) =>
            `attendance-at-risk-row attendance-at-risk-row--${normalizeAttendanceRiskStatus(row.status)}`
          }
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
