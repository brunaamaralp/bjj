import React, { useState } from 'react';
import { authService } from '../lib/auth';
import { Eye, EyeOff, UserPlus, X, LogIn } from 'lucide-react';
import NaviLogo from '../components/NaviLogo.jsx';
import NaviWordmark from '../components/NaviWordmark.jsx';
import { useNavigate, Link } from 'react-router-dom';

const Register = ({ onLogin }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!name.trim()) { setError('Informe o nome da academia.'); setLoading(false); return; }
      if (password.length < 8) { setError('Senha deve ter no mínimo 8 caracteres.'); setLoading(false); return; }
      await authService.register(email, password, name);
      const user = await authService.getCurrentUser();
      onLogin(user);
    } catch (err) {
      if (err.code === 409) {
        setError('Não foi possível criar a conta. Verifique os dados e tente novamente.');
      } else {
        setError(err.message || 'Erro ao criar conta.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, position: 'relative' }}>
          <button
            type="button"
            aria-label="Sair"
            title="Sair"
            className="btn-exit"
            onClick={async () => { try { await authService.logout(); } catch (e) { void e; } navigate('/'); }}
          >
            <X size={18} />
          </button>
          <NaviLogo size={52} />
        </div>
        <h1 className="login-title">
          <NaviWordmark fontSize={28} />
        </h1>
        <p className="login-subtitle">Crie sua conta</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Nome da Academia</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Team BJJ"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>E-mail</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-secondary btn-large login-btn" disabled={loading}>
            {loading ? <span className="spinner" /> : (<><UserPlus size={18} /> Criar Conta</>)}
          </button>
        </form>

        <div className="link-row">
          <Link className="toggle-mode" to="/login"><LogIn size={16} /> Já tem conta? Entrar</Link>
          <span className="sep">•</span>
          <Link className="toggle-mode" to="/">Voltar ao início</Link>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .login-page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: linear-gradient(180deg, var(--v50) 0%, var(--paper) 55%, var(--white) 100%); padding: 20px;
        }
        .login-card {
          width: 100%; max-width: 400px; background: var(--surface);
          border-radius: 16px; padding: 40px 30px;
          border: 0.5px solid var(--border-violet);
          box-shadow: 0 8px 32px rgba(91, 63, 191, 0.16); text-align: center;
          animation: fadeInUp 0.5s ease;
        }
        .btn-exit {
          position: absolute; right: 0; top: 0; transform: translate(30%, -30%);
          background: white; border: 1px solid var(--border); color: var(--text);
          border-radius: 999px; padding: 6px; min-height: auto; cursor: pointer;
          box-shadow: var(--shadow-sm);
        }
        .login-title { margin: 0 0 4px; display: flex; align-items: center; justify-content: center; }
        .login-subtitle { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }
        .login-form { text-align: left; display: flex; flex-direction: column; gap: 16px; }
        .password-wrapper { position: relative; }
        .password-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--text-muted); padding: 0;
          min-height: auto; cursor: pointer;
        }
        .login-error {
          padding: 10px 14px; background: var(--danger-light); color: var(--danger);
          border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 500;
        }
        .login-btn { margin-top: 4px; }
        .login-btn:disabled { opacity: 0.6; cursor: wait; }
        .toggle-mode {
          background: none; border: none; color: var(--accent); font-weight: 600;
          font-size: 0.85rem; margin-top: 20px; cursor: pointer; padding: 0; min-height: auto;
        }
        .link-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 8px; }
        .sep { color: var(--text-muted); }
        .spinner {
          width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.6s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
};

export default Register;
