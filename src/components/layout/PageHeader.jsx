import React from 'react';

/**
 * Cabeçalho padrão de página (H1 + subtítulo + meta + ações + toolbar).
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.meta]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} [props.toolbar] — conteúdo interno de page-header-card
 * @param {React.ReactNode} [props.prefix] — link ou breadcrumb acima do título
 * @param {string} [props.className]
 * @param {string} [props.metaClassName]
 * @param {boolean} [props.animate=true]
 */
export default function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  toolbar,
  prefix,
  className = '',
  metaClassName = '',
  animate = true,
}) {
  const rootClass = ['navi-page-header', animate ? 'animate-in' : '', className].filter(Boolean).join(' ');
  const metaClass = ['navi-eyebrow', 'navi-page-header__meta', metaClassName].filter(Boolean).join(' ');

  return (
    <header className={rootClass}>
      {prefix}
      <div className="navi-page-header__top">
        <div className="navi-page-header__intro">
          <h1 className="navi-page-title">{title}</h1>
          {subtitle ? <p className="navi-subtitle navi-page-header__subtitle">{subtitle}</p> : null}
          {meta ? (
            <p className={metaClass} data-page-meta>
              {meta}
            </p>
          ) : null}
        </div>
        {actions ? <div className="navi-page-header__actions">{actions}</div> : null}
      </div>
      {toolbar ? (
        <div className="page-header-card navi-page-header__toolbar">
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}
