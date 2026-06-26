import React from 'react';
import { Link } from 'react-router-dom';
import { FileSignature, LogOut, User } from 'lucide-react';
import { usePortal } from './PortalLayout.jsx';

export default function PortalMore() {
  const { logout } = usePortal();

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Mais</h1>
      <div className="portal-card">
        <Link to="/portal/perfil" className="portal-list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} aria-hidden />
            Meu perfil
          </span>
          <span>→</span>
        </Link>
        <Link to="/portal/contratos" className="portal-list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSignature size={18} aria-hidden />
            Contratos
          </span>
          <span>→</span>
        </Link>
        <button
          type="button"
          className="portal-list-item portal-btn--ghost"
          style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={() => void logout()}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogOut size={18} aria-hidden />
            Sair
          </span>
        </button>
      </div>
    </div>
  );
}
