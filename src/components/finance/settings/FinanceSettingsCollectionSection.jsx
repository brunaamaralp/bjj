import React from 'react';
import { Link } from 'react-router-dom';
import CollectionRulesSection from '../CollectionRulesSection.jsx';

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
      <Link to="/financeiro?tab=mensalidades&filtro=overdue" className="finance-config-context-link">
        Ver inadimplentes →
      </Link>
    </div>
  );
}
