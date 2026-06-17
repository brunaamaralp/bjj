import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { isAttendanceConfigured } from '../../lib/attendance.js';
import { useAttendanceRetentionSummary } from '../../hooks/useAttendanceRetentionSummary.js';
import { buildRecepcaoRetencaoPath } from '../../lib/recepcaoHubTabs.js';

/**
 * Indicador discreto na mesa Experimentais quando há alunos em risco de frequência.
 */
export default function RecepcaoRetentionHint({ academyId }) {
  const attendanceReady = isAttendanceConfigured();
  const { atRiskCount, loading } = useAttendanceRetentionSummary(academyId, {
    enabled: attendanceReady && Boolean(academyId),
  });

  if (!attendanceReady || loading || atRiskCount <= 0) return null;

  const label =
    atRiskCount === 1 ? '1 aluno em risco de churn' : `${atRiskCount} alunos em risco de churn`;

  return (
    <Link to={buildRecepcaoRetencaoPath()} className="recepcao-retention-hint card animate-in">
      <AlertTriangle size={18} className="recepcao-retention-hint__icon" aria-hidden />
      <span className="recepcao-retention-hint__text">{label}</span>
      <span className="recepcao-retention-hint__cta">
        Ver fila na catraca
        <ChevronRight size={16} aria-hidden />
      </span>
    </Link>
  );
}
