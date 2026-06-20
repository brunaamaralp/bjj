import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, LogOut, User, Users } from 'lucide-react';
import { matchNavTarget } from '../../lib/naviMenu.js';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import { useAnchoredMenuPosition } from '../../hooks/useAnchoredMenuPosition.js';
import { DropdownMenuDivider, DropdownMenuPanel } from '../shared/menu';

const USER_MENU_Z = 'var(--z-elevated, 13000)';

function initialsFromUser(user) {
  const name = String(user?.name || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  const email = String(user?.email || '').trim();
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export default function NaviUserMenu({
  user,
  onLogout,
  academyList,
  academyId,
  academyName,
  onAcademyChange,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationSig = `${location.pathname}${location.search}`;
  const [menuSession, setMenuSession] = useState({ sig: locationSig, open: false });
  const open = menuSession.sig === locationSig && menuSession.open;
  const setOpen = (next) => {
    const resolved = typeof next === 'function' ? next(open) : next;
    setMenuSession({ sig: locationSig, open: Boolean(resolved) });
  };
  const triggerRef = useRef(null);
  const rootRef = useDismissibleMenu(open, setOpen, {
    dismissExtraSelector: '[data-navi-user-menu-panel]',
  });
  const panelStyle = useAnchoredMenuPosition(triggerRef, open, {
    align: 'end',
    minWidth: 280,
    maxHeight: 520,
    zIndex: USER_MENU_Z,
  });

  const displayName = useMemo(() => {
    const name = String(user?.name || '').trim();
    if (name) return name;
    const email = String(user?.email || '').trim();
    if (email) return email.split('@')[0];
    return 'Minha conta';
  }, [user?.name, user?.email]);

  const email = String(user?.email || '').trim();
  const initials = useMemo(() => initialsFromUser(user), [user]);
  const showAcademySwitcher = Array.isArray(academyList) && academyList.length > 1;

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const menuItemClass = (path) => {
    const active = matchNavTarget(path, location);
    return `navi-menu__item navi-user-menu-item${active ? ' navi-menu__item--active navi-user-menu-item--active' : ''}`;
  };

  const menuPanel =
    open && panelStyle
      ? createPortal(
          <DropdownMenuPanel
            className="navi-user-menu-dropdown"
            fixed
            elevated
            style={panelStyle}
            role="menu"
            aria-label="Menu da conta"
            data-navi-user-menu-panel
          >
            <div className="navi-user-menu-header" role="none">
              <span className="navi-user-menu-header-name">{displayName}</span>
              {email ? <span className="navi-user-menu-header-email">{email}</span> : null}
            </div>

            {showAcademySwitcher || academyName ? (
              <div className="navi-user-menu-academy" role="none">
                <span className="navi-user-menu-academy-label">Academia ativa</span>
                {showAcademySwitcher ? (
                  <select
                    className="navi-user-menu-academy-select form-input"
                    value={academyId || ''}
                    aria-label="Trocar academia"
                    onChange={(e) => onAcademyChange?.(e.target.value)}
                  >
                    {academyList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="navi-user-menu-academy-name">{academyName}</span>
                )}
              </div>
            ) : null}

            <DropdownMenuDivider />

            <button type="button" role="menuitem" className={menuItemClass('/configuracoes')} onClick={() => go('/configuracoes')}>
              <Building2 size={16} strokeWidth={1.75} aria-hidden />
              Configurações
            </button>
            <button type="button" role="menuitem" className={menuItemClass('/equipe')} onClick={() => go('/equipe')}>
              <Users size={16} strokeWidth={1.75} aria-hidden />
              Equipe
            </button>
            <button type="button" role="menuitem" className={menuItemClass('/conta')} onClick={() => go('/conta')}>
              <User size={16} strokeWidth={1.75} aria-hidden />
              Conta
            </button>

            <DropdownMenuDivider />

            <button
              type="button"
              role="menuitem"
              className="navi-menu__item navi-user-menu-item navi-menu__item--danger"
              onClick={() => {
                setOpen(false);
                onLogout?.();
              }}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              Sair
            </button>
          </DropdownMenuPanel>,
          document.body,
        )
      : null;

  return (
    <div className="navi-user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="navi-user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={displayName}
      >
        <span className="navi-user-menu-avatar" aria-hidden>
          {initials}
        </span>
        <span className="navi-user-menu-name">{displayName}</span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`navi-user-menu-chevron${open ? ' navi-user-menu-chevron--open' : ''}`}
          aria-hidden
        />
      </button>
      {menuPanel}
    </div>
  );
}
