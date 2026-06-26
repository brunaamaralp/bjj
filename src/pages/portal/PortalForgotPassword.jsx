import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/portal.css';

export default function PortalForgotPassword() {
  return (
    <div className="portal-auth-page">
      <div className="portal-auth-card">
        <h1 className="portal-auth-title">Recuperar senha</h1>
        <p className="portal-card__muted">
          Em breve você poderá redefinir a senha por aqui. Por enquanto, peça à academia um novo convite
          ou use a recuperação de senha do Appwrite pelo link enviado ao seu e-mail.
        </p>
        <Link to="/portal/login" className="portal-btn portal-btn--ghost" style={{ marginTop: 16, textAlign: 'center' }}>
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
