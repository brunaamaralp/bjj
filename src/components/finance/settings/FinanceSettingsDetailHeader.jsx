import React from 'react';
import { ChevronLeft } from 'lucide-react';

export default function FinanceSettingsDetailHeader({ title, subtitle, onBack }) {
  return (
    <header className="finance-settings-detail-header">
      <button type="button" className="finance-settings-detail-header__back edit-link" onClick={onBack}>
        <ChevronLeft size={18} aria-hidden />
        Financeiro
      </button>
      <h3 className="navi-section-heading finance-settings-detail-header__title">{title}</h3>
      {subtitle ? <p className="text-small text-muted finance-settings-detail-header__subtitle">{subtitle}</p> : null}
    </header>
  );
}
