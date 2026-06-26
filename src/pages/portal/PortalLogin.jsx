import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { authService } from '../../lib/auth';
import { fetchPortalContext } from '../../lib/portalApi';
import { friendlyError } from '../../lib/errorMessages';
import { setPortalActiveAcademyId, setPortalActiveStudentId, resolveActiveStudentFromContext } from '../../lib/portalSession';
import '../../styles/portal.css';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.login(email, password);
      const ctx = await fetchPortalContext();
      const activeId = resolveActiveStudentFromContext(ctx);
      if (!activeId) {
        setError('Sua conta não tem acesso ao portal do aluno.');
        await authService.logout();
        return;
      }
      setPortalActiveStudentId(activeId);
      setPortalActiveAcademyId(ctx.academy_id);
      const activeStudent = (ctx.students || []).find((s) => s.id === activeId);
      if (activeStudent?.must_change_password) {
        navigate('/portal/trocar-senha', { replace: true });
      } else {
        navigate('/portal', { replace: true });
      }
    } catch (err) {
      if (err?.code === 401 || err?.status === 401) setError('E-mail ou senha incorretos.');
      else if (err?.code === 'no_portal_access') setError('Sua conta não tem acesso ao portal do aluno.');
      else setError(friendlyError(err, 'action'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-auth-page">
      <div className="portal-auth-card">
        <h1 className="portal-auth-title">Portal do aluno</h1>
        <p className="portal-auth-subtitle">Acesse com o e-mail do convite</p>
        <form onSubmit={handleSubmit}>
          <div className="portal-field">
            <label htmlFor="portal-login-email">E-mail</label>
            <input
              id="portal-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
            />
          </div>
          <div className="portal-field">
            <label htmlFor="portal-login-password">Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                id="portal-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error ? <p className="portal-error" role="alert">{error}</p> : null}
          <button type="submit" className="portal-btn portal-btn--primary" disabled={loading}>
            {loading ? 'Entrando…' : (<><LogIn size={18} /> Entrar</>)}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: '0.85rem' }}>
          <Link to="/portal/esqueci-senha">Esqueci minha senha</Link>
        </p>
      </div>
    </div>
  );
}
