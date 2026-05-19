import React from 'react';
import { Link } from 'react-router-dom';
import { buildPlanSelectOptions } from '../../lib/academyPlans.js';

export default function PlanSelect({
  financeConfig,
  value,
  onChange,
  onPlanPick,
  id,
  className = 'form-input',
  style,
  disabled = false,
  emptyLabel = 'Selecione o plano…',
  showConfigHint = true,
}) {
  const options = buildPlanSelectOptions(financeConfig, value);
  const hasConfigured = (financeConfig?.plans || []).some((p) => String(p?.name || '').trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select
        id={id}
        className={className}
        style={style}
        disabled={disabled}
        value={value || ''}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          if (onPlanPick) {
            const opt = options.find((o) => o.value === next);
            onPlanPick(opt?.plan || null);
          }
        }}
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {showConfigHint && !hasConfigured ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Nenhum plano cadastrado. Configure em{' '}
          <Link to="/empresa?tab=financeiro" className="edit-link">
            Configurações → Financeiro → Planos
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
