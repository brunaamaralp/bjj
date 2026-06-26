import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildPlanSelectOptions } from '../../lib/academyPlans.js';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import { pickFinanceConfigForPayments } from '../../lib/financeConfigForPayments.js';
import { loadMergedFinanceConfigForAcademy } from '../../lib/prefetchFinanceConfig.js';
import { useLeadStore } from '../../store/useLeadStore';
import SearchableSelect from './SearchableSelect.jsx';

export default function PlanSelect({
  academyId: academyIdProp,
  financeConfig,
  value,
  onChange,
  onPlanPick,
  id,
  className = '',
  style,
  disabled = false,
  allowEmpty = false,
  emptyOptionLabel = 'Sem plano',
  emptyLabel = 'Selecione o plano…',
  emptyMessage = 'Nenhum plano encontrado para essa busca.',
  showConfigHint = true,
  ...rest
}) {
  const setFinanceConfig = useLeadStore((s) => s.setFinanceConfig);
  const storeAcademyId = useLeadStore((s) => s.academyId);
  const academyId = academyIdProp || storeAcademyId;
  const storeFinanceConfig = useLeadStore((s) => s.financeConfig);
  const storeFinanceAcademyId = useLeadStore((s) => s.financeConfigAcademyId);
  const storeMatch =
    storeFinanceAcademyId === academyId && storeFinanceConfig ? storeFinanceConfig : null;
  const [fetchedConfig, setFetchedConfig] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const resolvedFinanceConfig = useMemo(
    () => pickFinanceConfigForPayments(fetchedConfig, storeMatch, financeConfig),
    [fetchedConfig, storeMatch, financeConfig]
  );

  const options = buildPlanSelectOptions(resolvedFinanceConfig, value, {
    allowEmpty,
    emptyOptionLabel,
  });
  const hasConfigured = (resolvedFinanceConfig?.plans || []).some((p) =>
    String(p?.name || '').trim()
  );

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    setLoadingPlans(true);
    void loadMergedFinanceConfigForAcademy(academyId, { force: true })
      .then((cfg) => {
        if (cancelled || !cfg) return;
        setFetchedConfig(cfg);
        if (useLeadStore.getState().academyId === academyId) {
          setFinanceConfig(cfg, academyId);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, setFinanceConfig]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <SearchableSelect
        id={id}
        className={className}
        disabled={disabled || loadingPlans}
        value={value || ''}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        placeholder={loadingPlans ? 'Carregando planos…' : emptyLabel}
        emptyMessage={loadingPlans ? 'Carregando planos…' : emptyMessage}
        onChange={(next) => {
          onChange(next);
          if (onPlanPick) {
            const opt = options.find((o) => o.value === next);
            onPlanPick(opt?.plan || null);
          }
        }}
        {...rest}
      />
      {showConfigHint && !hasConfigured && !loadingPlans ? (
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
