import React from 'react';
import { Link } from 'react-router-dom';
import CollectionRulesSection from '../CollectionRulesSection.jsx';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../../lib/financeiroReceivablesSections.js';

export default function FinanceSettingsCollectionSection({
  collectionRules,
  onRulesChange,
}) {
  return (
    <div className="finance-settings-section-body finance-settings-section-body--flush">
      <CollectionRulesSection
        collectionRules={collectionRules}
        onRulesChange={onRulesChange}
      />
      <Link
        to={buildReceivablesPath({
          section: RECEIVABLES_SECTIONS.MENSALIDADES,
          filtro: 'overdue',
        })}
        className="finance-config-context-link"
      >
        Ver inadimplentes →
      </Link>
    </div>
  );
}
