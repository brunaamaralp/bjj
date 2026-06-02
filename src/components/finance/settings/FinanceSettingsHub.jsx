import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import {
  FINANCE_SETTINGS_GROUPS,
  buildFinanceSettingsSummaries,
  financeSettingsProgress,
} from '../../../lib/financeSettingsSections.js';

function SettingsRow({ item, summary, onSelect }) {
  const meta = summary[item.id] || { summary: '', done: false };
  return (
    <button type="button" className="finance-settings-row" onClick={() => onSelect(item.id)}>
      <span className="finance-settings-row__main">
        <span className="finance-settings-row__label">{item.label}</span>
        <span className="finance-settings-row__value">{meta.summary}</span>
      </span>
      <span className="finance-settings-row__aside">
        {meta.done ? (
          <CheckCircle2 size={16} className="finance-settings-row__check" aria-hidden />
        ) : (
          <Circle size={16} className="finance-settings-row__pending" aria-hidden />
        )}
        <ChevronRight size={18} className="finance-settings-row__chevron" aria-hidden />
      </span>
    </button>
  );
}

export default function FinanceSettingsHub({
  financeConfig,
  collectionRules,
  accountsCount,
  contractTemplatesCount = 0,
  isOwner,
  onSelectSection,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const summaries = useMemo(
    () =>
      buildFinanceSettingsSummaries({
        financeConfig,
        collectionRules,
        accountsCount,
        contractTemplatesCount,
        isOwner,
      }),
    [financeConfig, collectionRules, accountsCount, contractTemplatesCount, isOwner]
  );

  const progress = financeSettingsProgress(summaries);

  return (
    <div className="finance-settings-hub animate-in">
      <div className="finance-settings-progress card" role="status">
        <p className="finance-settings-progress__title">
          {progress.done === progress.total
            ? 'Financeiro configurado'
            : `${progress.done} de ${progress.total} essenciais concluídos`}
        </p>
        <div className="finance-settings-progress__bar" aria-hidden>
          <div
            className="finance-settings-progress__fill"
            style={{
              '--progress-pct': `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {FINANCE_SETTINGS_GROUPS.map((group) => {
        if (group.collapsible && !advancedOpen) {
          return (
            <div key={group.id} className="finance-settings-group">
              <button
                type="button"
                className="finance-settings-group__toggle"
                aria-expanded={false}
                onClick={() => setAdvancedOpen(true)}
              >
                <span>{group.label}</span>
                <ChevronDown size={18} aria-hidden />
              </button>
            </div>
          );
        }

        const items = group.items.filter((item) => {
          const meta = summaries[item.id];
          if (meta?.hidden) return false;
          if (item.ownerOnly && !isOwner) return false;
          return true;
        });

        if (items.length === 0) return null;

        return (
          <div key={group.id} className="finance-settings-group">
            {group.collapsible ? (
              <button
                type="button"
                className="finance-settings-group__toggle"
                aria-expanded
                onClick={() => setAdvancedOpen(false)}
              >
                <span>{group.label}</span>
                <ChevronDown size={18} className="finance-settings-group__chevron--open" aria-hidden />
              </button>
            ) : (
              <p className="finance-settings-group__label">{group.label}</p>
            )}
            <div className="finance-settings-group__list card">
              {items.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {idx > 0 ? <div className="finance-settings-group__sep" aria-hidden /> : null}
                  <SettingsRow item={item} summary={summaries} onSelect={onSelectSection} />
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
