import React from 'react';

/**
 * Cabeçalho de seção dentro de uma página.
 *
 * @param {object} props
 * @param {'h2' | 'h3' | 'h4'} [props.as='h2']
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {string} [props.className]
 */
export default function SectionHeader({ as: Tag = 'h2', title, subtitle, actions, className = '' }) {
  const rootClass = ['navi-section-header', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      <div className="navi-section-header__row">
        <Tag className="navi-section-heading">{title}</Tag>
        {actions ? <div className="navi-section-header__actions">{actions}</div> : null}
      </div>
      {subtitle ? <p className="navi-subtitle navi-section-header__subtitle">{subtitle}</p> : null}
    </div>
  );
}
