import React, { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { preloadInbox } from '../../lib/preloadRoutes.js';
import {
  Plus,
  PlusCircle,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';
import { dispatchOpenNovaVendaModal } from '../../lib/novaVendaModal.js';
import { dispatchOpenNewLeadModal } from '../../lib/newLeadModal.js';
import { getNavMenuIcon } from '../../lib/naviMenuIcons.js';
import {
  buildSidebarNavModel,
  getAccordionIdForLocation,
  isAccordionChildActive,
  isAccordionParentPartial,
  isDirectNavPath,
  isSidebarNavItemActive,
  matchNavTarget,
  NAV_ACCORDION_IDS,
  NOVA_VENDA_MENU_ACTION,
  NOVO_LANCAMENTO_MENU_ACTION,
  FINANCEIRO_NOVO_LANCAMENTO_PATH,
} from '../../lib/naviMenu.js';

function SidebarSection({ title, children, collapsed, footer = false, showDivider = false }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div
      className={[
        'navi-sidebar-section',
        footer ? 'navi-sidebar-section--footer' : '',
        title ? 'navi-sidebar-section--titled' : '',
        showDivider ? 'navi-sidebar-section--divider' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showDivider && collapsed ? <hr className="navi-sidebar-section-rule" aria-hidden /> : null}
      {title && !collapsed ? (
        <span className="navi-sidebar-section-title">{title}</span>
      ) : null}
      {children}
    </div>
  );
}

function SideNavLink({
  to,
  end,
  label,
  Icon,
  collapsed,
  className,
  badge,
  useNavLink = true,
  action = false,
  onClick,
}) {
  const location = useLocation();
  const iconSize = action ? (collapsed ? 22 : 24) : 20;
  const IconComponent = action && collapsed ? Plus : Icon;
  const inner = (
    <>
      <span className={`navi-sidebar-link__icon${action ? ' navi-sidebar-link__icon--action' : ''}`}>
        <IconComponent size={iconSize} strokeWidth={action ? 2.25 : 1.75} />
      </span>
      <span className="navi-sidebar-link__label">{label}</span>
      {badge}
    </>
  );
  const title = collapsed ? label : undefined;
  const modifiers = [
    action ? 'navi-sidebar-link--action' : '',
    collapsed && action ? 'navi-sidebar-link--action-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const resolveNavClass = (state) => {
    const hasQuery = String(to || '').includes('?');
    const navActive = hasQuery
      ? isSidebarNavItemActive(to, location)
      : Boolean(state?.isActive) || isSidebarNavItemActive(to, location);
    const merged = { ...state, isActive: navActive };
    if (typeof className === 'function') {
      return [className(merged), modifiers].filter(Boolean).join(' ');
    }
    return [
      className || 'navi-sidebar-link',
      modifiers,
      navActive ? 'active navi-sidebar-link--active' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  if (onClick && useNavLink) {
    return (
      <NavLink to={to} end={end} className={resolveNavClass} title={title} onClick={onClick}>
        {inner}
      </NavLink>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={resolveNavClass({ isActive: isSidebarNavItemActive(to, location) })}
        title={title}
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }

  if (useNavLink) {
    return (
      <NavLink to={to} end={end} className={resolveNavClass} title={title}>
        {inner}
      </NavLink>
    );
  }
  return (
    <Link
      to={to}
      className={resolveNavClass({ isActive: isSidebarNavItemActive(to, location) })}
      title={title}
    >
      {inner}
    </Link>
  );
}

/** Links diretos sob título de seção (Financeiro, Vendas) — sem accordion duplicado. */
function SideNavSectionItems({ items, collapsed, sideLinkClass, location }) {
  const navigate = useNavigate();
  if (!items?.length) return null;

  return (
    <>
      {items.map((child, idx) => {
        const Icon = getNavMenuIcon(child.iconKey);
        const childActive = isAccordionChildActive(child, location);
        const prevGroup = idx > 0 ? items[idx - 1]?.group : null;
        const showGroup = child.group && child.group !== prevGroup;

        const linkClassName = ({ isActive }) => {
          const active = isActive || childActive;
          return [
            typeof sideLinkClass === 'function'
              ? sideLinkClass({ isActive: active })
              : sideLinkClass || 'navi-sidebar-link',
            active ? 'active navi-sidebar-link--active' : '',
          ]
            .filter(Boolean)
            .join(' ');
        };

        if (child.action === NOVA_VENDA_MENU_ACTION) {
          const actionClassName = (state) =>
            [linkClassName(state), 'navi-sidebar-link--section-action'].filter(Boolean).join(' ');
          return (
            <SideNavLink
              key={child.id}
              label={child.label}
              Icon={Icon}
              collapsed={collapsed}
              className={actionClassName}
              onClick={() => dispatchOpenNovaVendaModal()}
            />
          );
        }

        if (child.action === NOVO_LANCAMENTO_MENU_ACTION) {
          const actionClassName = (state) =>
            [linkClassName(state), 'navi-sidebar-link--section-action'].filter(Boolean).join(' ');
          return (
            <SideNavLink
              key={child.id}
              to={child.to || FINANCEIRO_NOVO_LANCAMENTO_PATH}
              label={child.label}
              Icon={Icon}
              collapsed={collapsed}
              className={actionClassName}
              onClick={(e) => {
                e.preventDefault();
                navigate(child.to || FINANCEIRO_NOVO_LANCAMENTO_PATH);
              }}
            />
          );
        }

        return (
          <React.Fragment key={child.id}>
            {showGroup && !collapsed ? (
              <div className="navi-sidebar-subgroup" role="presentation">
                <span className="navi-sidebar-subgroup__label">{child.group}</span>
              </div>
            ) : null}
            <SideNavLink
              to={child.to}
              label={child.label}
              Icon={Icon}
              collapsed={collapsed}
              className={linkClassName}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

function SideNavAccordion({
  accordion,
  icon,
  collapsed,
  expanded,
  onExpandExclusive,
  onToggle,
  sideLinkClass,
  location,
}) {
  const Icon = icon;
  const navigate = useNavigate();
  const panelId = `navi-accordion-panel-${accordion.id}`;
  const linkOnly = accordion.linkOnly === true || accordion.children.length === 0;
  const hubPath = String(accordion.defaultTo || '').split('?')[0];
  const onHubRoute = hubPath && location.pathname === hubPath;
  const partial = linkOnly ? onHubRoute : isAccordionParentPartial(accordion, location);
  const anyChildActive = linkOnly
    ? onHubRoute
    : accordion.children.some((c) => isAccordionChildActive(c, location));

  if (linkOnly) {
    const linkClass = (state) => {
      const base =
        typeof sideLinkClass === 'function' ? sideLinkClass(state) : sideLinkClass || 'navi-sidebar-link';
      return partial || anyChildActive || state.isActive ? `${base} active navi-sidebar-link--active` : base;
    };
    return (
      <NavLink to={accordion.defaultTo} className={linkClass} title={accordion.label}>
        <span className="navi-sidebar-link__icon">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <span className="navi-sidebar-link__label">{accordion.label}</span>
      </NavLink>
    );
  }

  if (collapsed) {
    return (
      <NavLink
        to={accordion.defaultTo}
        className={(state) => {
          const base =
            typeof sideLinkClass === 'function' ? sideLinkClass(state) : sideLinkClass || 'navi-sidebar-link';
          return partial || anyChildActive || state.isActive
            ? `${base} navi-sidebar-link--partial`
            : base;
        }}
        title={accordion.label}
      >
        <span className="navi-sidebar-link__icon">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <span className="navi-sidebar-link__label">{accordion.label}</span>
      </NavLink>
    );
  }

  const onLabelNavigate = () => {
    navigate(accordion.defaultTo);
    onExpandExclusive(accordion.id);
  };

  const headClass = [
    'navi-sidebar-link',
    'navi-sidebar-link--accordion',
    partial ? 'navi-sidebar-link--partial' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`navi-sidebar-accordion${expanded ? ' navi-sidebar-accordion--open' : ''}`}>
      <div className="navi-sidebar-accordion__head">
        <div className={headClass}>
        <button
          type="button"
          className="navi-sidebar-accordion__trigger"
          onClick={onLabelNavigate}
          title={accordion.label}
        >
          <span className="navi-sidebar-link__icon">
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <span className="navi-sidebar-link__label">{accordion.label}</span>
        </button>
        <button
          type="button"
          className="navi-sidebar-accordion__chevron"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? `Recolher ${accordion.label}` : `Expandir ${accordion.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(accordion.id);
          }}
        >
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
        </div>
      </div>
      <div
        id={panelId}
        className="navi-sidebar-accordion__panel"
        data-open={expanded ? 'true' : 'false'}
      >
        <ul className="navi-sidebar-accordion__panel-inner" role="list">
          {accordion.children.map((child, idx) => {
            const childActive = isAccordionChildActive(child, location);
            const prevGroup = idx > 0 ? accordion.children[idx - 1]?.group : null;
            const showGroup = child.group && child.group !== prevGroup;
            return (
              <React.Fragment key={child.id}>
                {showGroup ? (
                  <li className="navi-sidebar-accordion__group" role="presentation">
                    <span className="navi-sidebar-accordion__group-label">{child.group}</span>
                  </li>
                ) : null}
                <li role="listitem">
                  <NavLink
                    to={child.to}
                    className={() => {
                      const active =
                        childActive || isSidebarNavItemActive(child.to, location);
                      return [
                        'navi-sidebar-link navi-sidebar-link--child',
                        active ? 'active navi-sidebar-link--active' : '',
                      ].join(' ');
                    }}
                  >
                    <span className="navi-sidebar-link__label">{child.label}</span>
                  </NavLink>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NavModulesSkeleton({ collapsed }) {
  if (collapsed) {
    return (
      <>
        <div className="navi-side-skeleton-line" aria-hidden />
        <div className="navi-side-skeleton-line navi-side-skeleton-line--short" aria-hidden />
      </>
    );
  }
  return (
    <div className="navi-side-nav-skeleton" aria-hidden>
      <span className="navi-sidebar-section-title navi-side-skeleton-title">···</span>
      <div className="navi-side-skeleton-line" />
      <div className="navi-side-skeleton-line" />
      <div className="navi-side-skeleton-line navi-side-skeleton-line--short" />
    </div>
  );
}

export default function NaviSidebarNav({
  collapsed,
  sideLinkClass,
  labels,
  navStudentsLabel,
  newLeadLabel,
  modules,
  modulesReady = true,
  canConfigureAgenteIa,
  navRole = 'member',
  inboxUnread,
  waSetupDone = true,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [userAccordionId, setUserAccordionId] = useState(null);

  const navModel = useMemo(
    () =>
      buildSidebarNavModel({
        modules,
        canConfigureAgenteIa,
        pipelineLabel: labels.pipeline || 'Funil',
        navStudentsLabel,
        newLeadLabel,
        navRole,
        isOwner: navRole === 'owner',
        waSetupDone,
      }),
    [modules, canConfigureAgenteIa, labels.pipeline, navStudentsLabel, newLeadLabel, navRole, waSetupDone]
  );

  const routeAccordion = useMemo(
    () => getAccordionIdForLocation(location),
    [location]
  );
  const expandedAccordionId =
    routeAccordion ?? (isDirectNavPath(location.pathname) ? null : userAccordionId);

  const expandExclusive = (id) => setUserAccordionId(id);

  const toggleAccordion = (id) => {
    setUserAccordionId((prev) => (prev === id ? null : id));
  };

  const automacoesAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES);
  const financeiroAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.FINANCEIRO);
  const lojaAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.LOJA);

  const conversasActive = matchNavTarget('/inbox', location);
  const showSidebarActions = Boolean(navModel.newLead);

  return (
    <nav id="navi-sidebar-nav" className="navi-sidebar-nav">
      <SidebarSection collapsed={collapsed}>
        {showSidebarActions ? (
          <div className="navi-sidebar-actions">
            {navModel.newLead ? (
              <SideNavLink
                label={navModel.newLead.label}
                Icon={PlusCircle}
                collapsed={collapsed}
                className={sideLinkClass}
                action
                useNavLink={false}
                onClick={() => dispatchOpenNewLeadModal()}
              />
            ) : null}
          </div>
        ) : null}
        {navModel.primary.map((item) => (
          <SideNavLink
            key={item.to}
            to={item.to}
            end={item.end}
            label={item.label}
            Icon={getNavMenuIcon(item.iconKey)}
            collapsed={collapsed}
            className={sideLinkClass}
            onClick={
              item.to === '/pipeline'
                ? (e) => {
                    e.preventDefault();
                    navigate('/pipeline', { state: { fresh: true } });
                  }
                : undefined
            }
          />
        ))}
      </SidebarSection>

      <SidebarSection title="Atendimento" collapsed={collapsed} showDivider>
        {!modulesReady ? (
          <NavModulesSkeleton collapsed={collapsed} />
        ) : automacoesAccordion ? (
          <SideNavAccordion
            accordion={automacoesAccordion}
            icon={getNavMenuIcon('automacoes')}
            collapsed={collapsed}
            expanded={expandedAccordionId === automacoesAccordion.id}
            onExpandExclusive={expandExclusive}
            onToggle={toggleAccordion}
            sideLinkClass={sideLinkClass}
            location={location}
          />
        ) : null}
        {modulesReady && navModel.conectarWhatsApp ? (
          <SideNavLink
            to={navModel.conectarWhatsApp.to}
            label={navModel.conectarWhatsApp.label}
            Icon={getNavMenuIcon(navModel.conectarWhatsApp.iconKey)}
            collapsed={collapsed}
            className={sideLinkClass}
          />
        ) : null}
        {modulesReady && navModel.agenteIa ? (
          <SideNavLink
            to={navModel.agenteIa.to}
            label={navModel.agenteIa.label}
            Icon={getNavMenuIcon(navModel.agenteIa.iconKey)}
            collapsed={collapsed}
            className={sideLinkClass}
          />
        ) : null}
        <Link
          to="/inbox"
          className={`navi-sidebar-link${conversasActive ? ' active navi-sidebar-link--active' : ''}`}
          title={collapsed ? 'Conversas' : undefined}
          onMouseEnter={() => { void preloadInbox(); }}
          onFocus={() => { void preloadInbox(); }}
        >
          <span className="navi-sidebar-link__icon">
            <MessageCircle size={20} strokeWidth={1.75} />
            {inboxUnread > 0 ? (
              <span
                className="navi-inbox-unread-dot"
                title={`${inboxUnread} conversa(s) com mensagens não lidas`}
                aria-hidden
              />
            ) : null}
          </span>
          <span className="navi-sidebar-link__label">Conversas</span>
        </Link>
      </SidebarSection>

      {!modulesReady ? (
        <SidebarSection title="Financeiro" collapsed={collapsed} showDivider>
          <NavModulesSkeleton collapsed={collapsed} />
        </SidebarSection>
      ) : financeiroAccordion ? (
        <SidebarSection title="Financeiro" collapsed={collapsed} showDivider>
          <SideNavSectionItems
            items={financeiroAccordion.children}
            collapsed={collapsed}
            sideLinkClass={sideLinkClass}
            location={location}
          />
        </SidebarSection>
      ) : null}

      {!modulesReady ? (
        <SidebarSection title="Vendas" collapsed={collapsed} showDivider>
          <NavModulesSkeleton collapsed={collapsed} />
        </SidebarSection>
      ) : lojaAccordion ? (
        <SidebarSection title="Vendas" collapsed={collapsed} showDivider>
          <SideNavSectionItems
            items={lojaAccordion.children}
            collapsed={collapsed}
            sideLinkClass={sideLinkClass}
            location={location}
          />
        </SidebarSection>
      ) : null}

      {navModel.analise?.length ? (
        <SidebarSection title="Análise" collapsed={collapsed} showDivider>
          <SideNavSectionItems
            items={navModel.analise}
            collapsed={collapsed}
            sideLinkClass={sideLinkClass}
            location={location}
          />
        </SidebarSection>
      ) : null}
    </nav>
  );
}
