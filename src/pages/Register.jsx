import React, { useState } from 'react';
import { authService } from '../lib/auth';
import { Eye, EyeOff, UserPlus, Shield, X, LogIn } from 'lucide-react';
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
      if (err.code === 409) setError('Este e-mail já está cadastrado.');
      else setError(err.message || 'Erro ao criar conta.');
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
            onClick={async () => { try { await authService.logout(); } catch (e) { void e; } navigate('/welcome'); }}
          >
            <X size={18} />
          </button>
          <Shield size={48} color="var(--accent)" />
        </div>
        <h1 className="login-title">FitGrow</h1>
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

        <Link className="toggle-mode" to="/login"><LogIn size={16} /> Já tem conta? Entrar</Link>
      </div>
    </div>
  );
};

export default Register;
