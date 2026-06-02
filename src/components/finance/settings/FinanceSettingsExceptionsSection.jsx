import React from 'react';
import { Link } from 'react-router-dom';
import ExceptionStatusLabelsSection from '../ExceptionStatusLabelsSection.jsx';

export default function FinanceSettingsExceptionsSection({ labels, onChange }) {
  return (
    <div className="finance-settings-section-body finance-settings-section-body--flush">
      <ExceptionRulesIntro />
      <ExceptionStatusLabelsSection labels={labels} onChange={onChange} />
      <Link to="/financeiro?tab=mensalidades" className="finance-config-context-link">
        Ver pendências →
      </Link>
    </div>
  );
}

function ExceptionRulesIntro() {
  return (
    <p className="text-small text-muted finance-settings-exceptions-intro">
      Personalize como aparecem status como bolsa e cortesia nas mensalidades.
    </p>
  );
}
