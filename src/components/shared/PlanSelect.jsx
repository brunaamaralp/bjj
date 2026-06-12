import React from 'react';
import { Link } from 'react-router-dom';
import { buildPlanSelectOptions } from '../../lib/academyPlans.js';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import SearchableSelect from './SearchableSelect.jsx';

export default function PlanSelect({
  financeConfig,
  value,
  onChange,
  onPlanPick,
  id,
  className = '',
  style,
  disabled = false,
  emptyLabel = 'Selecione o plano…',
  emptyMessage = 'Nenhum plano encontrado para essa busca.',
  showConfigHint = true,
  ...rest
}) {
  const options = buildPlanSelectOptions(financeConfig, value);
  const hasConfigured = (financeConfig?.plans || []).some((p) => String(p?.name || '').trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <SearchableSelect
        id={id}
        className={className}
        disabled={disabled}
        value={value || ''}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        placeholder={emptyLabel}
        emptyMessage={emptyMessage}
        onChange={(next) => {
          onChange(next);
          if (onPlanPick) {
            const opt = options.find((o) => o.value === next);
            onPlanPick(opt?.plan || null);
          }
        }}
        {...rest}
      />
      {showConfigHint && !hasConfigured ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Nenhum plano cadastrado. Configure em{' '}
          <Link to={EMPRESA_FINANCE_CONFIG_PATH} className="edit-link">
            Minha academia → Financeiro
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
