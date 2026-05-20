import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Kanban,
  GraduationCap,
  CheckSquare,
  Plus,
  PlusCircle,
  MessageCircle,
  Zap,
  FileSignature,
  Bot,
  Users,
  Wallet,
  BarChart3,
  Store,
  Landmark,
  ShoppingBag,
  ArrowLeftRight,
  Lock,
  Calculator,
  Receipt,
  Package,
  Boxes,
  ChevronRight,
} from 'lucide-react';
import {
  buildSidebarNavModel,
  getAccordionIdForLocation,
  isAccordionChildActive,
  isAccordionParentPartial,
  isDirectNavPath,
  matchNavTarget,
  NAV_ACCORDION_IDS,
} from '../../lib/naviMenu.js';

const ICONS = {
  inicio: LayoutGrid,
  pipeline: Kanban,
  students: GraduationCap,
  tarefas: CheckSquare,
  conversas: MessageCircle,
  automacoes: Zap,
  agente: Bot,
  mensalidades: Users,
  contratos: FileSignature,
  caixa: Landmark,
  loja: ShoppingBag,
  movimentacoes: ArrowLeftRight,
  fechamento: Lock,
  contabilidade: Calculator,
  vendas: Receipt,
  produtos: Package,
  estoque: Boxes,
  relatorios: BarChart3,
  reports: BarChart3,
};

function SidebarSection({ title, children, collapsed, footer = false, showDivider = false }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div
      className={[
        'navi-side-section',
        footer ? 'navi-side-section--footer' : '',
        title ? 'navi-side-section--titled' : '',
        showDivider ? 'navi-side-section--divider' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showDivider && collapsed ? <hr className="navi-side-section-rule" aria-hidden /> : null}
      {title && !collapsed ? <span className="navi-side-section-title">{title}</span> : null}
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
  footer = false,
}) {
  const iconSize = action && !collapsed ? 20 : 20;
  const IconComponent = action && collapsed ? Plus : Icon;
  const inner = (
    <>
      <span className={`navi-side-link-icon${action ? ' navi-side-link-icon--action' : ''}`}>
        <IconComponent size={iconSize} strokeWidth={action ? 2.25 : 1.75} />
      </span>
      <span className="navi-side-link-label">{label}</span>
      {badge}
    </>
  );
  const title = collapsed ? label : undefined;
  const modifiers = [
    action ? 'navi-side-link--action' : '',
    footer ? 'navi-side-link--footer' : '',
    collapsed && action ? 'navi-side-link--action-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const resolvedClass =
    typeof className === 'function'
      ? (state) => [className(state), modifiers].filter(Boolean).join(' ')
      : [className || 'navi-side-link', modifiers].filter(Boolean).join(' ');

  if (useNavLink) {
    return (
      <NavLink to={to} end={end} className={resolvedClass} title={title}>
        {inner}
      </NavLink>
    );
  }
  return (
    <Link to={to} className={resolvedClass} title={title}>
      {inner}
    </Link>
  );
}

function SideNavAccordion({
  accordion,
  Icon,
  collapsed,
  expanded,
  onExpandExclusive,
  onToggle,
  sideLinkClass,
  location,
  footer = false,
}) {
  const navigate = useNavigate();
  const panelId = `navi-accordion-panel-${accordion.id}`;
  const partial = isAccordionParentPartial(accordion, location);
  const anyChildActive = accordion.children.some((c) => isAccordionChildActive(c, location));

  if (collapsed) {
    return (
      <NavLink
        to={accordion.defaultTo}
        className={(state) => {
          const base =
            typeof sideLinkClass === 'function' ? sideLinkClass(state) : sideLinkClass || 'navi-side-link';
          return partial || anyChildActive || state.isActive
            ? `${base} navi-side-link--partial`
            : base;
        }}
        title={accordion.label}
      >
        <span className="navi-side-link-icon">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <span className="navi-side-link-label">{accordion.label}</span>
      </NavLink>
    );
  }

  const onLabelNavigate = () => {
    navigate(accordion.defaultTo);
    onExpandExclusive(accordion.id);
  };

  const headClass = [
    'navi-side-accordion-head',
    footer ? 'navi-side-link--footer' : '',
    partial ? 'navi-side-link--partial' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`navi-side-accordion${expanded ? ' navi-side-accordion--open' : ''}`}>
      <div className={headClass}>
        <button
          type="button"
          className="navi-side-accordion-trigger"
          onClick={onLabelNavigate}
          title={accordion.label}
        >
          <span className="navi-side-link-icon">
            <Icon size={20} strokeWidth={1.75} />
          </span>
          <span className="navi-side-link-label">{accordion.label}</span>
        </button>
        <button
          type="button"
          className="navi-side-accordion-chevron"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? `Recolher ${accordion.label}` : `Expandir ${accordion.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(accordion.id);
          }}
        >
          <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div
        id={panelId}
        className="navi-side-accordion-panel"
        data-open={expanded ? 'true' : 'false'}
      >
        <ul className="navi-side-accordion-panel-inner" role="list">
          {accordion.children.map((child) => {
            const childActive = isAccordionChildActive(child, location);
            return (
              <li key={child.id} role="listitem">
                <NavLink
                  to={child.to}
                  className={({ isActive }) =>
                    [
                      'navi-side-link navi-side-link--child',
                      (isActive || childActive) ? 'active navi-side-link--active' : '',
                      footer ? 'navi-side-link--footer' : '',
                    ].join(' ')
                  }
                >
                  <span className="navi-side-link-icon navi-side-link-icon--child-spacer" aria-hidden />
                  <span className="navi-side-link-label">{child.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
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
  canConfigureAgenteIa,
  inboxUnread,
}) {
  const location = useLocation();
  const [expandedAccordionId, setExpandedAccordionId] = useState(null);

  const navModel = useMemo(
    () =>
      buildSidebarNavModel({
        modules,
        canConfigureAgenteIa,
        pipelineLabel: labels.pipeline || 'Funil',
        navStudentsLabel,
        newLeadLabel,
      }),
    [modules, canConfigureAgenteIa, labels.pipeline, navStudentsLabel, newLeadLabel]
  );

  useEffect(() => {
    const routeAccordion = getAccordionIdForLocation(location);
    if (routeAccordion) {
      setExpandedAccordionId(routeAccordion);
      return;
    }
    if (isDirectNavPath(location.pathname)) {
      setExpandedAccordionId(null);
    }
  }, [location.pathname, location.search]);

  const expandExclusive = (id) => setExpandedAccordionId(id);

  const toggleAccordion = (id) => {
    setExpandedAccordionId((prev) => (prev === id ? null : id));
  };

  const automacoesAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.AUTOMACOES);
  const caixaAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.CAIXA);
  const lojaAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.LOJA);
  const relatoriosAccordion = navModel.accordions.find((a) => a.id === NAV_ACCORDION_IDS.RELATORIOS);

  const conversasActive = matchNavTarget('/inbox', location);

  return (
    <nav id="navi-sidebar-nav" className="navi-sidebar-nav">
      <SidebarSection collapsed={collapsed}>
        {navModel.newLead ? (
          <SideNavLink
            to={navModel.newLead.to}
            label={navModel.newLead.label}
            Icon={PlusCircle}
            collapsed={collapsed}
            className={sideLinkClass}
            action
          />
        ) : null}
        {navModel.primary.map((item) => (
          <SideNavLink
            key={item.to}
            to={item.to}
            end={item.end}
            label={item.label}
            Icon={ICONS[item.iconKey] || LayoutGrid}
            collapsed={collapsed}
            className={sideLinkClass}
          />
        ))}
      </SidebarSection>

      <SidebarSection title="Atendimento" collapsed={collapsed} showDivider>
        <Link
          to="/inbox"
          className={`navi-side-link${conversasActive ? ' active navi-side-link--active' : ''}`}
          title={collapsed ? 'Conversas' : undefined}
        >
          <span className="navi-side-link-icon">
            <MessageCircle size={20} strokeWidth={1.75} />
          </span>
          <span className="navi-side-link-label">Conversas</span>
          {inboxUnread > 0 && (
            <span
              className="navi-inbox-unread-dot"
              title={`${inboxUnread} conversa(s) com mensagens não lidas`}
              aria-hidden
            />
          )}
        </Link>
        {automacoesAccordion ? (
          <SideNavAccordion
            accordion={automacoesAccordion}
            Icon={ICONS.automacoes}
            collapsed={collapsed}
            expanded={expandedAccordionId === automacoesAccordion.id}
            onExpandExclusive={expandExclusive}
            onToggle={toggleAccordion}
            sideLinkClass={sideLinkClass}
            location={location}
          />
        ) : null}
      </SidebarSection>

      {navModel.financeDirect.length > 0 ? (
        <SidebarSection title="Financeiro" collapsed={collapsed} showDivider>
          {navModel.financeDirect.map((item) => (
            <SideNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              Icon={ICONS[item.iconKey] || Users}
              collapsed={collapsed}
              className={sideLinkClass}
            />
          ))}
          {caixaAccordion ? (
            <SideNavAccordion
              accordion={caixaAccordion}
              Icon={ICONS.caixa}
              collapsed={collapsed}
              expanded={expandedAccordionId === caixaAccordion.id}
              onExpandExclusive={expandExclusive}
              onToggle={toggleAccordion}
              sideLinkClass={sideLinkClass}
              location={location}
            />
          ) : null}
        </SidebarSection>
      ) : null}

      {lojaAccordion ? (
        <SidebarSection title="Loja" collapsed={collapsed} showDivider>
          <SideNavAccordion
            accordion={lojaAccordion}
            Icon={ICONS.loja}
            collapsed={collapsed}
            expanded={expandedAccordionId === lojaAccordion.id}
            onExpandExclusive={expandExclusive}
            onToggle={toggleAccordion}
            sideLinkClass={sideLinkClass}
            location={location}
          />
        </SidebarSection>
      ) : null}

      <div className="navi-sidebar-footer">
        <SidebarSection collapsed={collapsed} footer showDivider>
          {relatoriosAccordion ? (
            <SideNavAccordion
              accordion={relatoriosAccordion}
              Icon={ICONS.relatorios}
              collapsed={collapsed}
              expanded={expandedAccordionId === relatoriosAccordion.id}
              onExpandExclusive={expandExclusive}
              onToggle={toggleAccordion}
              sideLinkClass={sideLinkClass}
              location={location}
              footer
            />
          ) : null}
        </SidebarSection>
      </div>
    </nav>
  );
}
