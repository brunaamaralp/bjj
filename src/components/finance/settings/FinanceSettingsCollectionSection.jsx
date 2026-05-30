import React from 'react';
import { Link } from 'react-router-dom';
import CollectionRulesSection from '../CollectionRulesSection.jsx';

export default function FinanceSettingsCollectionSection({
  collectionRules,
  overdueLabel,
  onRulesChange,
  onOverdueLabelChange,
}) {
  return (
    <div className="finance-settings-section-body finance-settings-section-body--flush">
      <CollectionRulesSection
        collectionRules={collectionRules}
        overdueLabel={overdueLabel}
        onRulesChange={onRulesChange}
        onOverdueLabelChange={onOverdueLabelChange}
      />
      <Link to="/financeiro?tab=mensalidades&filtro=overdue" className="finance-config-context-link">
        Ver inadimplentes →
      </Link>
    </div>
  );
}
