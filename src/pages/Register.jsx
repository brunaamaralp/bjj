import React, { useState } from 'react';
import { authService } from '../lib/auth';
import { Eye, EyeOff, UserPlus, X, LogIn } from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import { useNavigate, Link } from 'react-router-dom';
import { TERMS } from '../lib/terminology.js';
import { friendlyError } from '../lib/errorMessages';

const Register = ({ onLogin }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [vertical, setVertical] = useState('fitness');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const registerTerms = TERMS[vertical] || TERMS.fitness;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!name.trim()) { setError(`Informe o nome da ${registerTerms.workspaceNoun}.`); setLoading(false); return; }
      if (password.length < 8) { setError('Senha deve ter no mínimo 8 caracteres.'); setLoading(false); return; }
      await authService.register(email, password, name);
      const user = await authService.getCurrentUser();
      onLogin(user, { vertical });
    } catch (err) {
      if (err.code === 409) {
        setError('Não foi possível criar a conta. Verifique os dados e tente novamente.');
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__backdrop" aria-hidden="true">
        <span className="login-page__blob login-page__blob--a" />
        <span className="login-page__blob login-page__blob--b" />
        <span className="login-page__blob login-page__blob--c" />
        <span className="login-page__spark login-page__spark--1" />
        <span className="login-page__spark login-page__spark--2" />
      </div>

      <div className="login-card login-card--register">
        <div className="login-logo">
          <button
            type="button"
            aria-label="Sair"
            title="Sair"
            className="btn-exit"
            onClick={async () => { try { await authService.logout(); } catch (e) { void e; } navigate('/'); }}
          >
            <X size={18} />
          </button>
          <NaviBrandLockup height={72} variant="light" className="navi-brand-lockup--auth" />
        </div>
        <h1 className="login-title" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Criar conta na nave</h1>
        <p className="login-subtitle">Crie sua conta</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Nome da {registerTerms.workspaceNounTitle}</label>
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
            <label>Tipo de negócio</label>
            <select
              className="form-input"
              value={vertical}
              onChange={(e) => setVertical(e.target.value === 'physio' ? 'physio' : 'fitness')}
            >
              <option value="fitness">Academia / Artes marciais</option>
              <option value="physio">Fisioterapia</option>
            </select>
            <p className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 6, marginBottom: 0 }}>
              Ajusta termos na interface (ex.: paciente vs aluno).
            </p>
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
    </div>
  );
};

export default Register;
