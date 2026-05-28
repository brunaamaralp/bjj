import React, { useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Kanban,
  CheckSquare,
  Users,
  Landmark,
  ShoppingBag,
  BarChart3,
  Zap,
  Building2,
  Plug,
  X,
} from 'lucide-react';
import { isMobileMoreItemActive } from '../../lib/mobileMoreNav.js';

const ICONS = {
  pipeline: Kanban,
  tarefas: CheckSquare,
  mensalidades: Users,
  financeiro: Landmark,
  loja: ShoppingBag,
  reports: BarChart3,
  relatorios: BarChart3,
  automacoes: Zap,
  empresa: Building2,
  equipe: Users,
  integracoes: Plug,
};

const SWIPE_CLOSE_PX = 56;

export default function NaviMobileMoreSheet({ open, onClose, items }) {
  const navigate = useNavigate();
  const location = useLocation();
  const touchStartY = useRef(null);

  const handleNavigate = (to) => {
    onClose();
    navigate(to);
  };

  const onTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      const start = touchStartY.current;
      touchStartY.current = null;
      if (start == null) return;
      const endY = e.changedTouches[0]?.clientY;
      if (endY != null && endY - start >= SWIPE_CLOSE_PX) {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className={`navi-mobile-more-sheet${open ? ' navi-mobile-more-sheet--open' : ''}`}
      aria-hidden={!open}
    >
      <div
        className="navi-mobile-more-sheet__backdrop"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        id="navi-mobile-more-panel"
        className="navi-mobile-more-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Mais opções"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="navi-mobile-more-sheet__handle" aria-hidden />
        <div className="navi-mobile-more-sheet__head">
          <span className="navi-mobile-more-sheet__head-title">Mais</span>
          <button
            type="button"
            className="navi-mobile-more-sheet__close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <nav className="navi-mobile-more-sheet__nav" aria-label="Atalhos">
          {items.map((item) => {
            const Icon = ICONS[item.iconKey] || Kanban;
            const active = isMobileMoreItemActive(item, location);
            return (
              <button
                key={item.id}
                type="button"
                className={`navi-mobile-more-sheet__link${active ? ' navi-mobile-more-sheet__link--active' : ''}`}
                onClick={() => handleNavigate(item.to)}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
