import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, CreditCard, LogOut, User } from 'lucide-react';

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
  myWorkspaceLabel,
  academyList,
  academyId,
  academyName,
  onAcademyChange,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

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
  const workspaceLabel = String(myWorkspaceLabel || 'Configurações da academia').trim();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="navi-user-menu" ref={rootRef}>
      <button
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

      {open ? (
        <div className="navi-user-menu-dropdown" role="menu" aria-label="Menu da conta">
          <div className="navi-user-menu-header" role="none">
            <span className="navi-user-menu-header-name">{displayName}</span>
            {email ? <span className="navi-user-menu-header-email">{email}</span> : null}
          </div>

          {(showAcademySwitcher || academyName) ? (
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

          <hr className="navi-user-menu-divider" aria-hidden />

          <button type="button" role="menuitem" className="navi-user-menu-item" onClick={() => go('/conta')}>
            <User size={16} strokeWidth={1.75} aria-hidden />
            Minha conta
          </button>
          <button type="button" role="menuitem" className="navi-user-menu-item" onClick={() => go('/conta?tab=assinatura')}>
            <CreditCard size={16} strokeWidth={1.75} aria-hidden />
            Assinatura
          </button>
          <button type="button" role="menuitem" className="navi-user-menu-item" onClick={() => go('/empresa')}>
            <Building2 size={16} strokeWidth={1.75} aria-hidden />
            {workspaceLabel}
          </button>

          <hr className="navi-user-menu-divider" aria-hidden />

          <button
            type="button"
            role="menuitem"
            className="navi-user-menu-item navi-user-menu-item--danger"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
