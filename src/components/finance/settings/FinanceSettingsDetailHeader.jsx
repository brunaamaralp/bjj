import React from 'react';
import { ChevronLeft } from 'lucide-react';

export default function FinanceSettingsDetailHeader({ title, subtitle, onBack, backLabel = 'Financeiro' }) {
  return (
    <header className="finance-settings-detail-header">
      {typeof onBack === 'function' ? (
        <button type="button" className="finance-settings-detail-header__back edit-link" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden />
          {backLabel}
        </button>
      ) : null}
      <h2 className="finance-settings-title">{title}</h2>
      {subtitle ? <p className="finance-settings-subtitle">{subtitle}</p> : null}
    </header>
  );
}
