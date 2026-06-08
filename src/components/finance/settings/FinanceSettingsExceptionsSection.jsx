import React from 'react';
import { Link } from 'react-router-dom';
import ExceptionStatusLabelsSection from '../ExceptionStatusLabelsSection.jsx';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../../lib/financeiroReceivablesSections.js';

export default function FinanceSettingsExceptionsSection({ labels, onChange }) {
  return (
    <div className="finance-settings-section-body finance-settings-section-body--flush">
      <ExceptionRulesIntro />
      <ExceptionStatusLabelsSection labels={labels} onChange={onChange} />
      <Link
        to={buildReceivablesPath({ section: RECEIVABLES_SECTIONS.MENSALIDADES })}
        className="finance-config-context-link"
      >
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
