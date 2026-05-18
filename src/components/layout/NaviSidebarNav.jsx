import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Kanban,
  GraduationCap,
  CheckSquare,
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

function SidebarSection({ title, children, collapsed, footer = false }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className={`navi-side-section${footer ? ' navi-side-section--footer' : ''}`}>
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
}) {
  const inner = (
    <>
      <Icon size={18} strokeWidth={1.75} />
      <span className="navi-side-link-label">{label}</span>
      {badge}
    </>
  );
  const title = collapsed ? label : undefined;
  if (useNavLink) {
    return (
      <NavLink to={to} end={end} className={className} title={title}>
        {inner}
      </NavLink>
    );
  }
  return (
    <Link to={to} className={className} title={title}>
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

      <SidebarSection title="Atendimento" collapsed={collapsed}>
        <Link
          to="/inbox"
          className={`navi-side-link${isInboxConversasNavActive ? ' active' : ''}`}
          title={collapsed ? 'Conversas' : undefined}
        >
          <MessageCircle size={18} strokeWidth={1.75} />
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
            <Bot size={18} strokeWidth={1.75} />
            <span className="navi-side-link-label">Agente IA</span>
          </Link>
        ) : null}
      </SidebarSection>

      {showFinance ? (
        <SidebarSection title="Financeiro" collapsed={collapsed}>
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
        <SidebarSection title="Loja" collapsed={collapsed}>
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

      <SidebarSection collapsed={collapsed} footer>
        <SideNavLink
          to="/reports"
          label="Relatórios"
          Icon={BarChart3}
          collapsed={collapsed}
          className={sideLinkClass}
        />
        <SideNavLink to="/conta" label="Conta" Icon={User} collapsed={collapsed} className={sideLinkClass} />
        <SideNavLink to="/planos" label="Planos" Icon={CreditCard} collapsed={collapsed} className={sideLinkClass} />
        <SideNavLink
          to="/empresa"
          label={myWorkspaceLabel}
          Icon={Building2}
          collapsed={collapsed}
          className={sideLinkClass}
        />
      </SidebarSection>
    </nav>
  );
}

