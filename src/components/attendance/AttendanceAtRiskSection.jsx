import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Users } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useWhatsappTemplates } from '../../lib/useWhatsappTemplates.js';
import { createCheckin, isAttendanceConfigured } from '../../lib/attendance.js';
import { fetchAttendanceRetention, postAttendanceRetentionAction } from '../../lib/attendanceRetentionApi.js';
import { sendWhatsappTemplateOutbound } from '../../lib/outboundWhatsappTemplate.js';
import { addLeadEvent } from '../../lib/leadEvents.js';
import {
  ATTENDANCE_RETENTION_EVENT_TYPES,
  ATTENDANCE_RISK_STATUS,
  normalizeAttendanceRiskStatus,
} from '../../../lib/attendanceRetentionCore.js';
import { buildAttendanceRetentionReasonPhrase } from '../../lib/attendanceRetentionReasonPhrase.js';
import {
  URL_RET_STATUS,
  patchRetentionStatusParam,
  resolveRetentionStatusFilter,
  retentionStatusFilterLabel,
} from '../../lib/attendanceRetentionFilters.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { deactivateStudent } from '../../lib/deactivateStudent.js';
import { getAcademyDocument } from '../../lib/getAcademyDocument.js';
import { readStudentExitReasonsFromAcademyDoc } from '../../lib/studentExitConfig.js';
import { useStudentStore } from '../../store/useStudentStore.js';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import FilterTag from '../shared/FilterTag.jsx';
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
 * Fila operacional de alunos em risco por frequência (Recepção → Presença).
 */
export default function AttendanceAtRiskSection({ className = '', onDataLoaded }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const { firstName: sessionUserName } = useSessionUser();
  const attendanceReady = isAttendanceConfigured();
  const [searchParams, setSearchParams] = useSearchParams();
  const turma = String(searchParams.get(URL_RET_TURMA) || '').trim();
  const belt = String(searchParams.get(URL_RET_BELT) || '').trim();
  const statusFilter = resolveRetentionStatusFilter(searchParams.get(URL_RET_STATUS));

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

  const clearStatusFilter = useCallback(() => {
    setSearchParams((prev) => patchRetentionStatusParam(prev, ''), { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!academyId) return;
    void getAcademyDocument(academyId)
      .then((doc) => setExitReasons(readStudentExitReasonsFromAcademyDoc(doc)))
      .catch(() => setExitReasons(readStudentExitReasonsFromAcademyDoc(null)));
  }, [academyId]);

  const allRows = data?.at_risk || [];
  const rows = useMemo(() => {
    if (!statusFilter) return allRows;
    return allRows.filter((row) => normalizeAttendanceRiskStatus(row.status) === statusFilter);
  }, [allRows, statusFilter]);

  const filterOptions = data?.filters || {};
  const turmaOptions = filterOptions.turmas || [];
  const beltOptions = filterOptions.belts || [];
  const queueCount = rows.length;
  const statusChipLabel = retentionStatusFilterLabel(statusFilter);

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

  const emptyDescription = statusFilter
    ? statusFilter === ATTENDANCE_RISK_STATUS.ABSENT
      ? 'Nenhum aluno sumido com os filtros atuais.'
      : 'Nenhum aluno em risco com os filtros atuais.'
    : 'Quando alguém ficar abaixo da meta semanal ou sumir por 15+ dias, aparece aqui.';

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

      {statusChipLabel ? (
        <div className="attendance-at-risk-status-chips">
          <FilterTag label={`Filtrando: ${statusChipLabel}`} onRemove={clearStatusFilter} />
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
          title={statusFilter ? 'Nenhum aluno neste filtro' : 'Nenhum aluno em risco agora'}
          description={emptyDescription}
        />
      ) : null}

      {rows.length > 0 ? (
        <ul className="attendance-at-risk-list" aria-label="Fila de retenção">
          {rows.map((row) => {
            const sid = String(row.studentId || '');
            const status = normalizeAttendanceRiskStatus(row.status);
            return (
              <li
                key={sid || row.name}
                className={`attendance-at-risk-list__item attendance-at-risk-row--${status}`}
              >
                <div className="attendance-at-risk-list__main">
                  <div className="attendance-at-risk-list__identity">
                    <StudentCell row={row} />
                    <AttendanceRiskBadge status={row.status} label={row.statusLabel} />
                  </div>
                  <p className="attendance-at-risk-list__reason">
                    {buildAttendanceRetentionReasonPhrase(row)}
                  </p>
                </div>
                <div className="attendance-at-risk-list__actions">
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
                </div>
              </li>
            );
          })}
        </ul>
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
