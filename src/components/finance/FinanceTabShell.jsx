import React from 'react';

/**
 * Shell visual padronizado para abas do hub Financeiro.
 * @param {React.ReactNode} [intro] — StatusBanner ou texto introdutório
 * @param {string} [title] — título interno da aba (h3)
 * @param {React.ReactNode} [badge] — badge ao lado do título
 * @param {React.ReactNode} [actions] — botões no canto direito do header
 * @param {React.ReactNode} [kpiStrip] — faixa de KPIs abaixo do header
 * @param {React.ReactNode} [subNav] — HubTabBar secondary ou filtros de seção
 */
export default function FinanceTabShell({
  intro,
  title,
  badge,
  actions,
  kpiStrip,
  subNav,
  children,
  className = '',
  panelClassName = '',
}) {
  const showHead = title || badge || actions;

  return (
    <section className={['finance-tab-panel', 'animate-in', panelClassName].filter(Boolean).join(' ')}>
      {intro ? <div className="finance-tab-shell__intro">{intro}</div> : null}

      {showHead ? (
        <header className="finance-tab__head">
          <div className="finance-tab__head-main">
            {title ? (
              <h3 className="navi-section-heading finance-tab__head-title">{title}</h3>
            ) : null}
            {badge}
          </div>
          {actions ? <div className="finance-tab__head-actions">{actions}</div> : null}
        </header>
      ) : null}

      {kpiStrip ? <div className="finance-kpi-strip">{kpiStrip}</div> : null}
      {subNav ? <div className="finance-tab-shell__subnav">{subNav}</div> : null}

      <div className={['finance-tab-shell__body', className].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}
