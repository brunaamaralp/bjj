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
            <div className="login-page__backdrop" aria-hidden="true">
                <span className="login-page__blob login-page__blob--a" />
                <span className="login-page__blob login-page__blob--b" />
                <span className="login-page__blob login-page__blob--c" />
                <span className="login-page__spark login-page__spark--1" />
                <span className="login-page__spark login-page__spark--2" />
            </div>

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
                    <NaviBrandLockup height={72} variant="light" className="navi-brand-lockup--login" />
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
          position: relative;
          isolation: isolate;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 20px;
          overflow: hidden;
          background: #0c0a14;
        }
        .login-page__backdrop {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 120% 80% at 50% -20%, rgba(93, 226, 193, 0.14) 0%, transparent 55%),
            radial-gradient(ellipse 90% 70% at 100% 100%, rgba(139, 141, 250, 0.18) 0%, transparent 50%),
            linear-gradient(165deg, #0c0a14 0%, #13111f 42%, #18152a 100%);
        }
        .login-page__backdrop::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0.35;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 85% 75% at 50% 45%, black 20%, transparent 78%);
        }
        .login-page__blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(72px);
        }
        .login-page__blob--a {
          width: min(520px, 90vw);
          height: min(520px, 90vw);
          top: -18%;
          left: -12%;
          background: radial-gradient(circle, rgba(93, 226, 193, 0.35) 0%, transparent 68%);
          animation: loginBlobDriftA 18s ease-in-out infinite;
        }
        .login-page__blob--b {
          width: min(440px, 80vw);
          height: min(440px, 80vw);
          bottom: -22%;
          right: -10%;
          background: radial-gradient(circle, rgba(139, 141, 250, 0.32) 0%, transparent 70%);
          animation: loginBlobDriftB 22s ease-in-out infinite;
        }
        .login-page__blob--c {
          width: min(280px, 55vw);
          height: min(280px, 55vw);
          top: 38%;
          right: 18%;
          background: radial-gradient(circle, rgba(108, 71, 216, 0.28) 0%, transparent 65%);
          animation: loginBlobDriftC 14s ease-in-out infinite;
        }
        .login-page__spark {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #8b8dfa;
          box-shadow: 0 0 12px rgba(139, 141, 250, 0.9), 0 0 24px rgba(139, 141, 250, 0.4);
        }
        .login-page__spark--1 { top: 22%; right: 24%; opacity: 0.85; }
        .login-page__spark--2 {
          bottom: 28%; left: 18%;
          width: 4px; height: 4px;
          background: #5de2c1;
          box-shadow: 0 0 10px rgba(93, 226, 193, 0.85);
          opacity: 0.7;
        }
        @keyframes loginBlobDriftA {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4%, 6%) scale(1.06); }
        }
        @keyframes loginBlobDriftB {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-5%, -4%) scale(1.05); }
        }
        @keyframes loginBlobDriftC {
          0%, 100% { transform: translate(0, 0); opacity: 0.75; }
          50% { transform: translate(-3%, 5%); opacity: 1; }
        }
        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border-radius: 20px;
          padding: 44px 32px 36px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow:
            0 0 0 1px rgba(139, 141, 250, 0.08),
            0 24px 64px rgba(0, 0, 0, 0.45),
            0 8px 24px rgba(93, 226, 193, 0.08);
          text-align: center;
          animation: fadeInUp 0.55s ease;
          overflow: hidden;
        }
        .btn-exit {
          position: absolute;
          right: 0;
          top: 0;
          transform: translate(30%, -30%);
          background: #ffffff;
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 999px;
          padding: 6px;
          min-height: auto;
          cursor: pointer;
          box-shadow: var(--shadow-sm);
        }
        .login-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 8px;
          position: relative;
          background: #ffffff;
        }
        .login-logo .navi-brand-lockup,
        .login-logo .navi-brand-lockup--login {
          display: block;
          height: 72px !important;
          width: auto !important;
          max-width: none !important;
          object-fit: contain;
        }
        .login-card .form-input {
          background: #fafafa;
          border-color: var(--border-mid);
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .login-card .form-input:focus {
          background: #ffffff;
          border-color: rgba(108, 71, 216, 0.45);
          box-shadow: 0 0 0 3px rgba(108, 71, 216, 0.12);
        }
        .login-title {
          margin: 0 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin: 0 0 28px;
          letter-spacing: -0.01em;
        }
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
          background: none; border: none; color: var(--color-primary);
          font-weight: 600;
          font-size: 0.85rem; margin-top: 20px; cursor: pointer; padding: 0; min-height: auto;
          text-decoration: none;
        }
        .toggle-mode:hover { color: var(--color-primary-dark); }
        .link-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
        .sep { color: var(--text-muted); }
        .spinner {
          width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.6s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .login-card { padding: 36px 22px 28px; border-radius: 16px; }
          .login-logo .navi-brand-lockup,
          .login-logo .navi-brand-lockup--login { height: 60px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-page__blob { animation: none; }
        }
      `}} />
        </div>
    );
};

export default Login;
