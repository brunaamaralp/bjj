import React from 'react';
import { Info, Users, UserPlus, UserMinus, TrendingDown, TrendingUp } from 'lucide-react';
import { metricTooltip } from '../../../lib/reportsMetricDefinitions.js';

function KpiCard({ title, value, icon, tooltipId, suffix = '' }) {
  return (
    <div className="reports-kpi-card reports-kpi-card--accent" title={metricTooltip(tooltipId)}>
      <div className="reports-kpi-card-head">
        <span className="reports-kpi-label">
          {title}
          <button
            type="button"
            className="reports-kpi-info"
            aria-label={`Definição: ${title}`}
            title={metricTooltip(tooltipId)}
          >
            <Info size={14} aria-hidden />
          </button>
        </span>
        <span className="reports-kpi-icon-wrap" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="reports-kpi-value">
        {value}
        {suffix}
      </div>
    </div>
  );
}

export default function ReportsStudentsPanel({ studentMetrics, loading }) {
  if (loading) {
    return (
      <div className="reports-kpi-grid mt-4" aria-busy="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="reports-kpi-card reports-kpi-skeleton" style={{ minHeight: 100 }} />
        ))}
      </div>
    );
  }

  const m = studentMetrics || {};
  const active = Number(m.activeAtStart) || 0;
  const novo = Number(m.newStudents) || 0;
  const off = Number(m.deactivations) || 0;
  const churn = Number(m.churnRate) || 0;
  const retention = Number(m.retentionRate) ?? Math.max(0, 100 - churn);

  return (
    <section className="mt-4 animate-in" aria-labelledby="reports-students-heading">
      <h3 id="reports-students-heading" className="navi-section-heading mb-2">
        Alunos
      </h3>
      <p className="text-small text-muted mb-3" style={{ lineHeight: 1.5 }}>
        Métricas de base matriculada no intervalo. Passe o mouse no ícone de cada card para ver a definição.
      </p>
      <div className="reports-kpi-grid">
        <KpiCard
          title="Ativos no início"
          value={active}
          tooltipId="activeStudentsStart"
          icon={<Users size={20} strokeWidth={2.25} />}
        />
        <KpiCard
          title="Novos alunos"
          value={novo}
          tooltipId="newStudents"
          icon={<UserPlus size={20} strokeWidth={2.25} />}
        />
        <KpiCard
          title="Desligamentos"
          value={off}
          tooltipId="deactivations"
          icon={<UserMinus size={20} strokeWidth={2.25} />}
        />
        <KpiCard
          title="Churn"
          value={churn.toFixed(1)}
          suffix="%"
          tooltipId="churnRate"
          icon={<TrendingDown size={20} strokeWidth={2.25} />}
        />
        <KpiCard
          title="Retenção"
          value={retention.toFixed(1)}
          suffix="%"
          tooltipId="retentionRate"
          icon={<TrendingUp size={20} strokeWidth={2.25} />}
        />
      </div>
    </section>
  );
}
