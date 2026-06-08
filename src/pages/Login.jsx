import React, { useState } from 'react';
import { authService } from '../lib/auth';
import { Eye, EyeOff, LogIn, X } from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import { useNavigate, Link } from 'react-router-dom';
import { friendlyError } from '../lib/errorMessages';

const Login = ({ onLogin }) => {
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
            const user = await authService.getCurrentUser();
            onLogin(user);
        } catch (err) {
            if (err.code === 401) setError('E-mail ou senha incorretos.');
            else if (err.code === 409) setError('Este e-mail já está cadastrado.');
            else setError(friendlyError(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
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
                    <NaviBrandLockup height={44} variant="light" />
                </div>
                <h1 className="login-title" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Entrar na nave</h1>
                <p className="login-subtitle">Acesse sua conta</p>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label>E-mail</label>
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="seu@email.com"
                            required
                            autoFocus
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
                                placeholder="Sua senha"
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
                        {loading ? <span className="spinner" /> : (<><LogIn size={18} /> Entrar</>)}
                    </button>
                </form>

                <div className="link-row">
                    <Link className="toggle-mode" to="/register">Não tem conta? Cadastre-se</Link>
                    <span className="sep">•</span>
                    <Link className="toggle-mode" to="/">Voltar ao início</Link>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .login-page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: linear-gradient(180deg, var(--creme) 0%, var(--azul-gelo) 55%, var(--azul-gelo) 100%); padding: 20px;
        }
        .login-card {
          width: 100%; max-width: 400px;
          background: #FFFFFF;
          border-radius: 16px; padding: 40px 30px;
          border: 0.5px solid var(--border-violet);
          box-shadow: 0 8px 32px rgba(0, 4, 53, 0.1); text-align: center;
          animation: fadeInUp 0.5s ease;
          overflow: hidden;
        }
        .btn-exit {
          position: absolute; right: 0; top: 0; transform: translate(30%, -30%);
          background: #FFFFFF; border: 1px solid var(--border); color: var(--text);
          border-radius: 999px; padding: 6px; min-height: auto; cursor: pointer;
          box-shadow: var(--shadow-sm);
        }
        .login-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 16px;
          position: relative;
          background: #FFFFFF;
        }
        .login-card .form-input {
          background: #FFFFFF;
          border-color: var(--border-mid);
        }
        .login-card .form-input:focus {
          background: #FFFFFF;
        }
        .login-title {
          margin: 0 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-subtitle { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }
        .login-form { text-align: left; display: flex; flex-direction: column; gap: 16px; }
        .login-card .password-wrapper { position: relative; }
        .login-card .password-wrapper .form-input { padding-right: 44px; }
        .login-card button.password-toggle {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          z-index: 2;
          background: none; border: none; color: var(--text-muted); padding: 0;
          min-height: auto; width: 40px; height: 40px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .login-card button.password-toggle:active {
          transform: translateY(-50%) scale(0.98);
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

export default Login;
