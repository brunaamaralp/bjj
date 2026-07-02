import React, { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, ChevronRight, UserCheck } from 'lucide-react';
import { maskPhone } from '../../lib/masks.js';
import ControlIdSyncBadge from './ControlIdSyncBadge.jsx';
import StudentStatusBadge from './StudentStatusBadge.jsx';
import StudentOverdueBadge from './StudentOverdueBadge.jsx';
import { resolveStudentListStatus } from '../../lib/studentDisplayStatus.js';
import { useStudentStore } from '../../store/useStudentStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { preloadStudentProfile } from '../../lib/preloadRoutes.js';
import { createCheckin, isAttendanceConfigured } from '../../lib/attendance.js';
import { useTerms } from '../../lib/terminology.js';
import { useToast } from '../../hooks/useToast.js';
import { emitLeadAttendanceChanged } from '../../lib/leadTimelineEvents.js';
import { friendlyError } from '../../lib/errorMessages.js';

function StudentListCard({
  student,
  academyId,
  controlIdEnabled,
  blockOverdueAccess = false,
  studentSingular,
  financeConfig,
  onOpenProfile,
  sessionUserName = '',
  showGraduation = false,
  style,
}) {
  const digits = String(student.phone || '').replace(/\D/g, '');
  const paymentHint = useStudentStore((s) => s.paymentStatusByStudentId[student.id]);
  const displayStatus = resolveStudentListStatus(student, paymentHint);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const terms = useTerms();
  const toast = useToast();
  const [checkingIn, setCheckingIn] = useState(false);
  const attendanceReady = isAttendanceConfigured();

  const permCtx = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId) || {};
    return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
  }, [academyList, academyId, userId]);

  const handleCheckin = useCallback(async () => {
    if (checkingIn || !student?.id || !academyId || !attendanceReady) return;
    setCheckingIn(true);
    try {
      await createCheckin(
        {
          lead_id: student.id,
          academy_id: academyId,
          checked_in_by: userId || 'user',
          checked_in_by_name: sessionUserName || 'Usuário',
        },
        permCtx
      );
      toast.success(`${terms.attendance} registrada!`);
      emitLeadAttendanceChanged(student.id);
    } catch (e) {
      toast.show({
        type: 'error',
        message: friendlyError(e, 'save') || `Não foi possível registrar a ${terms.attendance.toLowerCase()}.`,
      });
    } finally {
      setCheckingIn(false);
    }
  }, [
    academyId,
    attendanceReady,
    checkingIn,
    permCtx,
    sessionUserName,
    student?.id,
    terms.attendance,
    toast,
    userId,
  ]);

  return (
    <div className="card student-card animate-in" style={style}>
      <div className="flex justify-between items-center student-card-row">
        <div
          className="student-card-main"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenProfile(student.id);
            }
          }}
          onMouseEnter={() => { void preloadStudentProfile(); }}
          onClick={() => onOpenProfile(student.id)}
          style={{
            flex: 1,
            minWidth: 0,
            cursor: 'pointer',
            textAlign: 'left',
            border: 'none',
            background: 'none',
            padding: 0,
            font: 'inherit',
            color: 'inherit',
          }}
        >
          <strong style={{ fontSize: '0.95rem', display: 'block' }}>
            {student.name || 'Sem nome'}
          </strong>
          <div
            className="student-card-subline"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 4,
            }}
          >
            {displayStatus ? <StudentStatusBadge status={displayStatus} /> : null}
            <StudentOverdueBadge student={student} financeConfig={financeConfig} />
            {student.plan ? (
              <span className="text-small" style={{ margin: 0, color: 'var(--text-muted)' }}>
                {student.plan}
              </span>
            ) : null}
          </div>
          {controlIdEnabled ? (
            <ControlIdSyncBadge
              academyId={academyId}
              student={student}
              blockOverdueAccess={blockOverdueAccess}
            />
          ) : null}
          <p className="student-card-desktop-meta text-small" style={{ margin: '4px 0 0' }}>
            {[
              String(student.turma || student.className || '').trim(),
              showGraduation && String(student.belt || '').trim() ? String(student.belt).trim() : '',
              maskPhone(student.phone) || String(student.phone || '').trim(),
            ]
              .filter((p) => p && String(p).trim())
              .join(' • ') || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 student-card-actions">
          {attendanceReady ? (
            <button
              type="button"
              className="quick-action-btn students-touch-hit"
              onClick={(e) => {
                e.stopPropagation();
                void handleCheckin();
              }}
              disabled={checkingIn}
              title={checkingIn ? 'Registrando…' : `Registrar ${terms.attendance.toLowerCase()}`}
              aria-label={checkingIn ? 'Registrando presença' : `Registrar ${terms.attendance.toLowerCase()}`}
            >
              <UserCheck size={16} color="var(--accent)" />
            </button>
          ) : null}
          {digits ? (
            <Link
              to={`/inbox?phone=${encodeURIComponent(digits)}`}
              className="quick-action-btn students-touch-hit"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              title="Atendimento"
              aria-label="Abrir atendimento"
            >
              <MessageCircle size={16} color="var(--text-muted)" />
            </Link>
          ) : null}
          <Link
            to={`/student/${student.id}`}
            className="student-profile-chevron students-touch-hit"
            onClick={(e) => e.stopPropagation()}
            title={`Perfil do ${studentSingular.toLowerCase()}`}
            aria-label={`Abrir perfil do ${studentSingular.toLowerCase()}`}
          >
            <ChevronRight size={16} color="var(--text-muted)" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default memo(StudentListCard);
