import React from 'react';

/**
 * Barra de abas reutilizável (mesma linguagem visual do finance-tabs).
 * @param {{ id: string, label: string }[]} tabs
 */
export default function HubTabBar({ tabs, activeId, onChange, ariaLabel }) {
  if (!tabs?.length) return null;
  return (
    <div className="finance-tabs" role="tablist" aria-label={ariaLabel || 'Seções'}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          className={`finance-tab${activeId === tab.id ? ' finance-tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
