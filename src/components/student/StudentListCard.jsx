import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, ChevronRight } from 'lucide-react';
import { normalizeLeadProfileType } from '../../../lib/leadTypeNormalize.js';
import ControlIdSyncBadge from './ControlIdSyncBadge.jsx';
import StudentStatusBadge from './StudentStatusBadge.jsx';
import { resolveStudentListStatus } from '../../lib/studentDisplayStatus.js';
import { useStudentStore } from '../../store/useStudentStore.js';
import { preloadStudentProfile } from '../../lib/preloadRoutes.js';

function StudentListCard({
  student,
  academyId,
  controlIdEnabled,
  studentSingular,
  onOpenProfile,
  style,
}) {
  const digits = String(student.phone || '').replace(/\D/g, '');
  const paymentHint = useStudentStore((s) => s.paymentStatusByStudentId[student.id]);
  const displayStatus = resolveStudentListStatus(student, paymentHint);

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
            {student.plan ? (
              <span className="text-small" style={{ margin: 0, color: 'var(--text-muted)' }}>
                {student.plan}
              </span>
            ) : null}
          </div>
          {controlIdEnabled ? (
            <ControlIdSyncBadge academyId={academyId} student={student} />
          ) : null}
          <p className="student-card-desktop-meta text-small" style={{ margin: '4px 0 0' }}>
            {[normalizeLeadProfileType(student.type) || student.type, student.phone]
              .filter((p) => p && String(p).trim())
              .join(' • ') || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 student-card-actions">
          {digits ? (
            <Link
              to={`/inbox?phone=${encodeURIComponent(digits)}`}
              className="student-inbox-link students-touch-hit"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            >
              Atendimento
            </Link>
          ) : null}
          <button
            type="button"
            className="quick-action-btn students-touch-hit"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`https://wa.me/55${digits}`, '_blank');
            }}
            disabled={!digits}
            title="WhatsApp"
          >
            <MessageCircle size={16} color="#25D366" />
          </button>
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
