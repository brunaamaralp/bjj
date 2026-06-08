import React, { useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Kanban,
  GraduationCap,
  CheckSquare,
  PlusCircle,
  ArrowLeftRight,
  MessageCircle,
  Zap,
  Landmark,
  ShoppingBag,
  BarChart3,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Lock,
  Scale,
  SlidersHorizontal,
  BookOpen,
  Users,
  X,
} from 'lucide-react';
import {
  isSidebarNavItemActive,
  NOVA_VENDA_MENU_ACTION,
  NOVO_LANCAMENTO_MENU_ACTION,
  FINANCEIRO_NOVO_LANCAMENTO_PATH,
} from '../../lib/naviMenu.js';
import { dispatchOpenNovaVendaModal } from '../../lib/novaVendaModal.js';

const ICONS = {
  inicio: LayoutGrid,
  pipeline: Kanban,
  students: GraduationCap,
  tarefas: CheckSquare,
  conversas: MessageCircle,
  automacoes: Zap,
  financeiro: Landmark,
  visaoGeralFinanceiro: LayoutGrid,
  mensalidades: Users,
  movimentacoes: ArrowLeftRight,
  previsao: TrendingUp,
  fechamento: Lock,
  conciliacao: Scale,
  extratoContabil: BookOpen,
  configuracaoFinanceira: SlidersHorizontal,
  loja: ShoppingBag,
  reports: BarChart3,
  relatorios: BarChart3,
  vendas: Receipt,
  novoLancamento: PlusCircle,
};

const PIPELINE_PATH = '/pipeline';

export default function NaviMobileDrawer({
  open,
  onClose,
  sections,
  newLeadLabel,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleNovaVenda = () => {
    onClose();
    dispatchOpenNovaVendaModal();
  };

  const handleNovoLancamento = () => {
    onClose();
    navigate(FINANCEIRO_NOVO_LANCAMENTO_PATH);
  };

  return (
    <div className={`navi-mobile-drawer${open ? ' navi-mobile-drawer--open' : ''}`} aria-hidden={!open}>
      <div className="navi-mobile-drawer__backdrop" onClick={onClose} role="presentation" aria-hidden="true" />
      <div
        id="navi-mobile-nav-drawer"
        className="navi-mobile-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="navi-mobile-drawer__panel-inner">
          <div className="navi-mobile-drawer__head">
            <span className="navi-mobile-drawer__head-title">Menu</span>
            <button type="button" className="navi-mobile-drawer__close" onClick={onClose} aria-label="Fechar">
              <X size={22} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <nav className="navi-mobile-drawer__nav" aria-label="Navegação principal">
            {newLeadLabel ? (
              <div className="navi-mobile-drawer__actions">
                <Link
                  to="/new-lead"
                  className="navi-mobile-drawer__action navi-mobile-drawer__action--primary"
                  onClick={onClose}
                >
                  <PlusCircle size={18} strokeWidth={2.25} aria-hidden />
                  <span>{newLeadLabel}</span>
                </Link>
              </div>
            ) : null}
            {sections.map((section) => (
              <div key={section.title ?? '_root'} className="navi-mobile-drawer__section">
                {section.title ? (
                  <span className="navi-mobile-drawer__section-title">{section.title}</span>
                ) : null}
                {section.items.map((item) => {
                  const Icon = ICONS[item.iconKey] || LayoutGrid;
                  if (item.action === NOVA_VENDA_MENU_ACTION) {
                    return (
                      <button
                        key={`${item.id}-${item.label}`}
                        type="button"
                        className="navi-mobile-drawer__link navi-mobile-drawer__link--section-action"
                        onClick={handleNovaVenda}
                      >
                        <Icon size={20} strokeWidth={1.75} aria-hidden />
                        <span>{item.label}</span>
                      </button>
                    );
                  }
                  if (item.action === NOVO_LANCAMENTO_MENU_ACTION) {
                    return (
                      <button
                        key={`${item.id}-${item.label}`}
                        type="button"
                        className="navi-mobile-drawer__link navi-mobile-drawer__link--section-action"
                        onClick={handleNovoLancamento}
                      >
                        <Icon size={20} strokeWidth={1.75} aria-hidden />
                        <span>{item.label}</span>
                      </button>
                    );
                  }
                  const active = isSidebarNavItemActive(item.toFull || item.to, location);
                  const pathOnly = String(item.to || '').split('?')[0];
                  if (pathOnly === PIPELINE_PATH) {
                    return (
                      <button
                        key={`${item.to}-${item.label}`}
                        type="button"
                        className={`navi-mobile-drawer__link${active ? ' navi-mobile-drawer__link--active' : ''}`}
                        onClick={() => {
                          onClose();
                          navigate(PIPELINE_PATH, { state: { fresh: true } });
                        }}
                      >
                        <Icon size={20} strokeWidth={1.75} aria-hidden />
                        <span>{item.label}</span>
                      </button>
                    );
                  }
                  return (
                    <NavLink
                      key={`${item.toFull || item.to}-${item.label}`}
                      to={item.toFull || item.to}
                      className={`navi-mobile-drawer__link${active ? ' navi-mobile-drawer__link--active' : ''}`}
                      onClick={onClose}
                    >
                      <Icon size={20} strokeWidth={1.75} aria-hidden />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
