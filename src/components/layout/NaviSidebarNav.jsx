import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Kanban,
  GraduationCap,
  CheckSquare,
  Plus,
  PlusCircle,
  MessageCircle,
  FileText,
  Bot,
  Users,
  Wallet,
  BookOpen,
  ShoppingBag,
  Package,
  Boxes,
  BarChart3,
  User,
  CreditCard,
  Building2,
} from 'lucide-react';

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
  const iconSize = action && !collapsed ? 20 : 18;
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

export default function NaviSidebarNav({
  collapsed,
  sideLinkClass,
  labels,
  navStudentsLabel,
  newLeadLabel,
  modules,
  navRole,
  canConfigureAgenteIa,
  myWorkspaceLabel,
  isInboxConversasNavActive,
  isAgenteIaPage,
  inboxUnread,
}) {
  const showFinance = modules.finance === true;
  const showLoja = modules.inventory === true || modules.sales === true;

  return (
    <nav id="navi-sidebar-nav" className="navi-sidebar-nav">
      <SidebarSection collapsed={collapsed}>
        <SideNavLink to="/" end label="Início" Icon={LayoutGrid} collapsed={collapsed} className={sideLinkClass} />
        <SideNavLink
          to="/pipeline"
          label={labels.pipeline || 'Funil'}
          Icon={Kanban}
          collapsed={collapsed}
          className={sideLinkClass}
        />
        <SideNavLink
          to="/new-lead"
          label={newLeadLabel}
          Icon={PlusCircle}
          collapsed={collapsed}
          className={sideLinkClass}
          action
        />
        <SideNavLink
          to="/students"
          label={navStudentsLabel}
          Icon={GraduationCap}
          collapsed={collapsed}
          className={sideLinkClass}
        />
        <SideNavLink to="/tarefas" label="Tarefas" Icon={CheckSquare} collapsed={collapsed} className={sideLinkClass} />
      </SidebarSection>

      <SidebarSection title="Atendimento" collapsed={collapsed} showDivider>
        <Link
          to="/inbox"
          className={`navi-side-link${isInboxConversasNavActive ? ' active' : ''}`}
          title={collapsed ? 'Conversas' : undefined}
        >
          <span className="navi-side-link-icon">
            <MessageCircle size={18} strokeWidth={1.75} />
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
        <SideNavLink to="/templates" label="Templates" Icon={FileText} collapsed={collapsed} className={sideLinkClass} />
        {canConfigureAgenteIa ? (
          <Link
            to="/agente-ia"
            className={`navi-side-link${isAgenteIaPage ? ' active' : ''}`}
            title={collapsed ? 'Agente IA' : undefined}
          >
            <span className="navi-side-link-icon">
              <Bot size={18} strokeWidth={1.75} />
            </span>
            <span className="navi-side-link-label">Agente IA</span>
          </Link>
        ) : null}
      </SidebarSection>

      {showFinance ? (
        <SidebarSection title="Financeiro" collapsed={collapsed} showDivider>
          <SideNavLink
            to="/mensalidades"
            label="Mensalidades"
            Icon={Users}
            collapsed={collapsed}
            className={sideLinkClass}
          />
          <SideNavLink to="/caixa" label="Caixa" Icon={Wallet} collapsed={collapsed} className={sideLinkClass} />
          {navRole === 'owner' ? (
            <SideNavLink
              to="/finance"
              label="Contabilidade"
              Icon={BookOpen}
              collapsed={collapsed}
              className={sideLinkClass}
            />
          ) : null}
        </SidebarSection>
      ) : null}

      {showLoja ? (
        <SidebarSection title="Loja" collapsed={collapsed} showDivider>
          {modules.sales === true ? (
            <SideNavLink
              to="/vendas"
              label="Vendas"
              Icon={ShoppingBag}
              collapsed={collapsed}
              className={sideLinkClass}
            />
          ) : null}
          {modules.inventory === true || modules.sales === true ? (
            <SideNavLink
              to="/produtos"
              label="Produtos"
              Icon={Package}
              collapsed={collapsed}
              className={sideLinkClass}
            />
          ) : null}
          {modules.inventory === true ? (
            <SideNavLink
              to="/estoque"
              label="Estoque"
              Icon={Boxes}
              collapsed={collapsed}
              className={sideLinkClass}
            />
          ) : null}
        </SidebarSection>
      ) : null}

      <SidebarSection collapsed={collapsed} footer showDivider>
        <SideNavLink
          to="/reports"
          label="Relatórios"
          Icon={BarChart3}
          collapsed={collapsed}
          className={sideLinkClass}
          footer
        />
        <SideNavLink to="/conta" label="Conta" Icon={User} collapsed={collapsed} className={sideLinkClass} footer />
        <SideNavLink to="/planos" label="Planos" Icon={CreditCard} collapsed={collapsed} className={sideLinkClass} footer />
        <SideNavLink
          to="/empresa"
          label={myWorkspaceLabel}
          Icon={Building2}
          collapsed={collapsed}
          className={sideLinkClass}
          footer
        />
      </SidebarSection>
    </nav>
  );
}

