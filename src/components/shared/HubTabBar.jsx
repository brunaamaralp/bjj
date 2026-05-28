import React from 'react';

/**
 * Abas de hub interno (?tab=) — estilos globais em index.css (.navi-hub-tabs).
 * @param {{ id: string, label: string, disabled?: boolean, disabledTitle?: string }[]} tabs
 * @param {'primary'|'secondary'} [variant]
 * @param {'sm'|'md'} [size]
 * @param {boolean} [fullWidth]
 * @param {string} [className]
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
}) {
  if (!tabs?.length) return null;
  return (
    <div
      className={[
        'navi-hub-tabs',
        variant === 'secondary' ? 'navi-hub-tabs--secondary' : '',
        size === 'sm' ? 'navi-hub-tabs--sm' : '',
        fullWidth ? 'navi-hub-tabs--full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="tablist"
      aria-label={ariaLabel || 'Seções'}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
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
          {tab.label}
        </button>
      ))}
    </div>
  );
}
