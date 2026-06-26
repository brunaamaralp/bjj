import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Wallet, CalendarCheck, BookOpen, MoreHorizontal } from 'lucide-react';

const ITEMS = [
  { to: '/portal', label: 'Início', end: true, icon: Home },
  { to: '/portal/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/portal/presenca', label: 'Presença', icon: CalendarCheck },
  { to: '/portal/orientacoes', label: 'Orientações', icon: BookOpen },
  { to: '/portal/mais', label: 'Mais', icon: MoreHorizontal },
];

export default function PortalNav() {
  return (
    <nav className="portal-bottom-nav" aria-label="Navegação do portal">
      {ITEMS.map(({ to, label, end, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `portal-bottom-nav__link${isActive ? ' portal-bottom-nav__link--active' : ''}`
          }
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
