import React, { useState } from 'react';
import '../styles/auth-pages.css';
import { authService } from '../lib/auth';
import { Eye, EyeOff, LogIn, X } from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import { useNavigate, Link } from 'react-router-dom';
import { friendlyError } from '../lib/errorMessages';
import { LEGAL_ROUTES } from '../lib/legalConstants.js';

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
                    <NaviBrandLockup height={72} variant="light" className="navi-brand-lockup--auth" />
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
                <p className="login-legal-foot">
                    <Link to={LEGAL_ROUTES.terms} target="_blank" rel="noopener noreferrer">Termos</Link>
                    <span className="sep" aria-hidden>·</span>
                    <Link to={LEGAL_ROUTES.privacy} target="_blank" rel="noopener noreferrer">Privacidade</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
