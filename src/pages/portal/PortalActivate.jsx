import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { portalActivate } from '../../lib/portalApi';
import { friendlyError } from '../../lib/errorMessages';
import StatusBanner from '../../components/shared/StatusBanner.jsx';
import '../../styles/portal.css';

export default function PortalActivate() {
  const { token: routeToken } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const token = String(routeToken || '').trim();
    if (!token) {
      setStatus('error');
      setError('Link de ativação inválido.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await portalActivate(token);
        if (cancelled) return;
        setEmail(String(data.email || '').trim());
        setStatus('success');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        const code = String(e?.code || '');
        if (code === 'token_expired') setError('Este convite expirou. Peça um novo à academia.');
        else if (code === 'token_already_used') setError('Este convite já foi utilizado.');
        else setError(friendlyError(e, 'action'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeToken]);

  return (
    <div className="portal-auth-page">
      <div className="portal-auth-card">
        <h1 className="portal-auth-title">Ativar acesso</h1>
        {status === 'loading' ? <p className="portal-card__muted">Validando convite…</p> : null}
        {status === 'error' ? <StatusBanner variant="error" message={error} /> : null}
        {status === 'success' ? (
          <>
            <p className="portal-card__muted">
              Acesso ativado{email ? ` para ${email}` : ''}. Faça login para entrar no portal.
            </p>
            <button
              type="button"
              className="portal-btn portal-btn--primary"
              style={{ marginTop: 16 }}
              onClick={() => navigate('/portal/login', { replace: true })}
            >
              Ir para o login
            </button>
          </>
        ) : null}
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: '0.85rem' }}>
          <Link to="/portal/login">Já tenho conta</Link>
        </p>
      </div>
    </div>
  );
}
