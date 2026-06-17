import React from 'react';

/**
 * Abas de hub interno (?tab=) — estilos globais em index.css (.navi-hub-tabs).
 * @param {{ id: string, label: string, shortLabel?: string, disabled?: boolean, disabledTitle?: string, badgeCount?: number, badgeAriaLabel?: string }[]} tabs
 * @param {'primary'|'secondary'|'underline'} [variant]
 * @param {'sm'|'md'} [size]
 * @param {boolean} [fullWidth]
 * @param {string} [className]
 * @param {string} [panelIdPrefix] — prefixo para aria-controls (ex.: finance-tabpanel-)
 */
export default function HubTabBar({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  className = '',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  panelIdPrefix = '',
}) {
  if (!tabs?.length) return null;
  return (
    <div
      className={[
        'navi-hub-tabs',
        variant === 'secondary' ? 'navi-hub-tabs--secondary' : '',
        variant === 'underline' ? 'navi-hub-tabs--underline' : '',
        size === 'sm' ? 'navi-hub-tabs--sm' : '',
        fullWidth ? 'navi-hub-tabs--full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="tablist"
      aria-label={ariaLabel || 'Seções'}
    >
      {tabs.map((tab) => {
        const tabId = panelIdPrefix ? `${panelIdPrefix}tab-${tab.id}` : undefined;
        const panelId = panelIdPrefix ? `${panelIdPrefix}${tab.id}` : undefined;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId}
            aria-selected={activeId === tab.id}
            aria-controls={panelId}
            aria-disabled={tab.disabled ? true : undefined}
            disabled={Boolean(tab.disabled)}
            title={tab.disabled ? tab.disabledTitle || tab.label : undefined}
            className={[
              'navi-hub-tab',
              activeId === tab.id ? 'navi-hub-tab--active' : '',
              tab.disabled ? 'navi-hub-tab--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (!tab.disabled) onChange(tab.id);
            }}
          >
            <span className="navi-hub-tab__label--long">{tab.label}</span>
            <span className="navi-hub-tab__label--short">{tab.shortLabel || tab.label}</span>
            {Number(tab.badgeCount) > 0 ? (
              <span
                className="navi-hub-tab__badge"
                aria-label={tab.badgeAriaLabel || `${tab.badgeCount} pendente(s)`}
              >
                {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
