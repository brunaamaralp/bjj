import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, ChevronRight, Info, Shield, CreditCard } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { authService } from '../lib/auth';
import { createSessionJwt } from '../lib/appwrite';
import { isBillingLive } from '../lib/billingEnabled';
import { useUiStore } from '../store/useUiStore';

const MIN_PWD = 8;

const UserAccount = ({ user, onLogout }) => {
    const academyId = useLeadStore((s) => s.academyId);
    const addToast = useUiStore((s) => s.addToast);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwdSaving, setPwdSaving] = useState(false);
    const [billingStatus, setBillingStatus] = useState(null);

    useEffect(() => {
        if (!isBillingLive()) {
            setBillingStatus(null);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            try {
                const jwt = await createSessionJwt();
                if (!jwt || !academyId) return;
                const st = await fetch(`/api/billing/status?storeId=${encodeURIComponent(academyId)}`, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                const data = await st.json().catch(() => ({}));
                if (!cancelled && data.sucesso) setBillingStatus(data);
            } catch {
                void 0;
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [academyId]);

    const submitPassword = async (e) => {
        e.preventDefault();
        const oldP = String(oldPassword || '');
        const newP = String(newPassword || '');
        const conf = String(confirmPassword || '');
        if (newP.length < MIN_PWD) {
            addToast({ type: 'error', message: `A nova senha deve ter pelo menos ${MIN_PWD} caracteres.` });
            return;
        }
        if (newP !== conf) {
            addToast({ type: 'error', message: 'A confirmação não coincide com a nova senha.' });
            return;
        }
        setPwdSaving(true);
        try {
            await authService.updatePassword(newP, oldP);
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
            addToast({ type: 'success', message: 'Senha atualizada.' });
        } catch (err) {
            const msg = String(err?.message || err || '');
            if (/password|senha|invalid credentials|401/i.test(msg)) {
                addToast({ type: 'error', message: 'Senha atual incorreta ou sessão inválida. Tente sair e entrar de novo.' });
            } else {
                addToast({ type: 'error', message: msg || 'Não foi possível alterar a senha.' });
            }
        } finally {
            setPwdSaving(false);
        }
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="animate-in">
                <h2 className="navi-page-title">Conta</h2>
                <p className="navi-eyebrow" style={{ marginTop: 6 }}>Seu perfil, segurança e assinatura do app</p>
            </div>

            <div className="account-hero card mt-4 animate-in" style={{ animationDelay: '0.05s', borderTop: '4px solid var(--accent)' }}>
                <div className="flex items-center gap-4">
                    <div
                        className="account-avatar"
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <User size={28} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="navi-section-heading" style={{ fontSize: '1.05rem' }}>Sessão atual</h3>
                        <p className="navi-subtitle" style={{ marginTop: 4, wordBreak: 'break-all' }}>{user?.email || '—'}</p>
                    </div>
                </div>
            </div>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.08s' }}>
                <h3 className="navi-section-heading mb-2">Segurança</h3>
                <div className="card">
                    <form className="flex-col gap-4" onSubmit={submitPassword}>
                        <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
                            <div
                                className="action-icon"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 'var(--radius-sm)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    background: 'var(--accent-light)',
                                    color: 'var(--accent)',
                                }}
                            >
                                <Shield size={18} />
                            </div>
                            <div>
                                <strong className="text-small">Trocar senha</strong>
                                <p className="navi-subtitle" style={{ marginTop: 2 }}>Use a senha atual e uma nova com pelo menos {MIN_PWD} caracteres.</p>
                            </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="acc-old-pwd">Senha atual</label>
                            <input
                                id="acc-old-pwd"
                                className="form-input"
                                type="password"
                                autoComplete="current-password"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="acc-new-pwd">Nova senha</label>
                            <input
                                id="acc-new-pwd"
                                className="form-input"
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="acc-confirm-pwd">Confirmar nova senha</label>
                            <input
                                id="acc-confirm-pwd"
                                className="form-input"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn-secondary" disabled={pwdSaving || !oldPassword || !newPassword || !confirmPassword}>
                            {pwdSaving ? 'Salvando…' : 'Atualizar senha'}
                        </button>
                    </form>
                </div>
            </section>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.1s' }}>
                <h3 className="navi-section-heading mb-2">Assinatura do Nave</h3>
                <div className="card">
                    <div className="flex items-start gap-3">
                        <div
                            className="action-icon"
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: 'var(--accent-light)',
                                color: 'var(--accent)',
                            }}
                        >
                            <CreditCard size={18} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <strong className="text-small">Asaas</strong>
                            <p className="navi-subtitle" style={{ marginTop: 6 }}>
                                {!isBillingLive()
                                    ? 'Cobrança em preparação. Você pode abrir a prévia da tela de planos abaixo.'
                                    : billingStatus
                                      ? `Status: ${billingStatus.status || '—'}${billingStatus.currentPeriodEnd ? ` · até ${new Date(billingStatus.currentPeriodEnd).toLocaleDateString('pt-BR')}` : ''}`
                                      : 'Carregando status…'}
                            </p>
                            <p className="navi-subtitle" style={{ marginTop: 8 }}>
                                {isBillingLive()
                                    ? 'Gerencie plano e pagamento pelo checkout seguro (PIX, boleto ou cartão).'
                                    : 'Quando ativarmos a assinatura, o pagamento será feito por aqui com integração ao Asaas.'}
                            </p>
                            <Link to="/planos" className="btn-primary" style={{ marginTop: 12, display: 'inline-block', textDecoration: 'none' }}>
                                {isBillingLive() ? 'Ver planos e pagar' : 'Ver prévia dos planos'}
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.12s' }}>
                <h3 className="navi-section-heading mb-2">Sair</h3>
                <button
                    type="button"
                    className="card"
                    onClick={onLogout}
                    style={{
                        width: '100%',
                        textAlign: 'left',
                        border: '1px solid var(--border-light)',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 16,
                        borderRadius: 'var(--radius)',
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: '#f1f5f9',
                                color: '#64748b',
                            }}
                        >
                            <LogOut size={18} />
                        </div>
                        <div>
                            <strong>Encerrar sessão</strong>
                            <p className="navi-subtitle" style={{ marginTop: 2 }}>Desconectar deste dispositivo</p>
                        </div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </button>
            </section>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.15s' }}>
                <h3 className="navi-section-heading mb-2">Sobre</h3>
                <div className="card">
                    <div className="flex items-center gap-4">
                        <Info size={16} color="var(--text-muted)" />
                        <p className="text-xs text-light" style={{ margin: 0 }}>
                            Nave — dados na nuvem via Appwrite. Configurações da academia ficam em <strong>Minha academia</strong> no menu; encerrar sessão está acima.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default UserAccount;
