import React from 'react';

/**
 * L0–L4 filter shell: primary row (search + filters + actions) + optional active tags row.
 * @param {{
 *   primary?: React.ReactNode,
 *   active?: React.ReactNode | null,
 *   actions?: React.ReactNode,
 *   className?: string,
 *   stackedMobile?: boolean,
 * }} props
 */
export default function FilterToolbar({
  primary = null,
  active = null,
  actions = null,
  className = '',
  stackedMobile = false,
}) {
  const root = ['filter-toolbar', className].filter(Boolean).join(' ');
  const primaryClass = [
    'filter-toolbar__primary',
    'navi-toolbar',
    stackedMobile ? 'filter-bar--stacked-mobile' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={root}>
      <div className={primaryClass}>
        {primary}
        {actions ? (
          <>
            <div className="filter-toolbar__spacer" aria-hidden="true" />
            <div className="filter-toolbar__actions">{actions}</div>
          </>
        ) : null}
      </div>
      {active ? (
        <div className="filter-toolbar__active" aria-live="polite">
          {active}
        </div>
      ) : null}
    </div>
  );
}
