import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, CreditCard } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { onboardingDismissStorageKey } from '../lib/onboardingChecklist.js';
import { authService } from '../lib/auth';
import { createSessionJwt } from '../lib/appwrite';
import { isBillingLive } from '../lib/billingEnabled';
import { useUiStore } from '../store/useUiStore';

const MIN_PWD = 8;

function userInitial(email) {
    const s = String(email || '').trim();
    if (!s) return '?';
    return s[0].toUpperCase();
}

const UserAccount = ({ user, onLogout }) => {
    const academyId = useLeadStore((s) => s.academyId);
    const reopenOnboardingBanner = useLeadStore((s) => s.reopenOnboardingBanner);
    const addToast = useUiStore((s) => s.addToast);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwdSaving, setPwdSaving] = useState(false);
    const [billingStatus, setBillingStatus] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingError, setBillingError] = useState(false);

    useEffect(() => {
        if (!isBillingLive()) {
            setBillingStatus(null);
            return undefined;
        }
        if (!academyId) return undefined;
        let cancelled = false;
        setBillingLoading(true);
        setBillingError(false);
        (async () => {
            try {
                const jwt = await createSessionJwt();
                if (!jwt || !academyId) return;
                const st = await fetch(`/api/billing/status?storeId=${encodeURIComponent(academyId)}`, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                const data = await st.json().catch(() => ({}));
                if (cancelled) return;
                if (data.sucesso) {
                    setBillingStatus(data);
                } else {
                    setBillingError(true);
                }
            } catch {
                if (!cancelled) setBillingError(true);
            } finally {
                if (!cancelled) setBillingLoading(false);
            }
        })();
        return () => { cancelled = true; };
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

    const showOnboardingChecklistAgain = () => {
        if (!academyId) {
            addToast({ type: 'info', message: 'Selecione uma academia primeiro.' });
            return;
        }
        try {
            localStorage.removeItem(onboardingDismissStorageKey(academyId));
        } catch {
            void 0;
        }
        reopenOnboardingBanner();
        addToast({ type: 'success', message: 'O checklist voltará a aparecer no topo das páginas.' });
    };

    const billingStatusText = () => {
        if (!isBillingLive()) return null;
        if (billingLoading) return 'Carregando…';
        if (billingError) return null;
        if (!billingStatus) return null;
        const status = billingStatus.status || '—';
        const until = billingStatus.currentPeriodEnd
            ? ` · até ${new Date(billingStatus.currentPeriodEnd).toLocaleDateString('pt-BR')}`
            : '';
        return `${status}${until}`;
    };

    const email = user?.email || '';

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 40 }}>

            {/* Header com avatar + email */}
            <div className="animate-in" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: 'var(--accent)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    flexShrink: 0,
                    fontFamily: 'var(--ff-ui)',
                    letterSpacing: '-0.02em',
                }}>
                    {userInitial(email)}
                </div>
                <div style={{ minWidth: 0 }}>
                    <h2 className="navi-page-title" style={{ margin: 0 }}>Conta</h2>
                    <p style={{ margin: '3px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                        {email || '—'}
                    </p>
                </div>
            </div>

            {/* Primeiros passos */}
            <section className="mt-2 animate-in" style={{ animationDelay: '0.05s' }}>
                <h3 className="navi-section-heading mb-2">Primeiros passos</h3>
                <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <p className="navi-subtitle" style={{ margin: 0, flex: '1 1 200px' }}>
                        Fechou o checklist de configuração? Você pode exibi-lo novamente quando quiser.
                    </p>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={showOnboardingChecklistAgain}
                        disabled={!academyId}
                        title={!academyId ? 'Selecione uma academia primeiro' : undefined}
                    >
                        Mostrar checklist
                    </button>
                </div>
            </section>

            {/* Segurança */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.07s' }}>
                <h3 className="navi-section-heading mb-2">Segurança</h3>
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{
                            width: 40, height: 40,
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <Shield size={18} />
                        </div>
                        <div>
                            <strong className="text-small">Trocar senha</strong>
                            <p className="navi-subtitle" style={{ marginTop: 2 }}>
                                Nova senha com pelo menos {MIN_PWD} caracteres.
                            </p>
                        </div>
                    </div>
                    <form className="flex-col gap-4" onSubmit={submitPassword}>
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
                            {newPassword && newPassword.length < MIN_PWD && (
                                <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
                                    Mínimo {MIN_PWD} caracteres ({MIN_PWD - newPassword.length} restantes)
                                </p>
                            )}
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
                            {confirmPassword && newPassword && confirmPassword !== newPassword && (
                                <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>
                                    As senhas não coincidem
                                </p>
                            )}
                        </div>
                        <button
                            type="submit"
                            className="btn btn-secondary"
                            disabled={pwdSaving || !oldPassword || !newPassword || !confirmPassword}
                        >
                            {pwdSaving ? 'Salvando…' : 'Atualizar senha'}
                        </button>
                    </form>
                </div>
            </section>

            {/* Assinatura */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.09s' }}>
                <h3 className="navi-section-heading mb-2">Assinatura</h3>
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{
                            width: 40, height: 40,
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <CreditCard size={18} />
                        </div>
                        <div style={{ flex: 1 }}>
                            {isBillingLive() && (
                                <div style={{ marginBottom: 8 }}>
                                    {billingLoading && (
                                        <p className="navi-subtitle" style={{ margin: 0 }}>Carregando status…</p>
                                    )}
                                    {!billingLoading && billingError && (
                                        <p className="navi-subtitle" style={{ margin: 0, color: 'var(--text-muted)' }}>
                                            Não foi possível carregar o status da assinatura.
                                        </p>
                                    )}
                                    {!billingLoading && !billingError && billingStatusText() && (
                                        <p className="navi-subtitle" style={{ margin: 0 }}>
                                            <strong style={{ color: 'var(--text)', fontWeight: 700 }}>Status:</strong>{' '}
                                            {billingStatusText()}
                                        </p>
                                    )}
                                </div>
                            )}
                            <p className="navi-subtitle" style={{ margin: 0 }}>
                                {isBillingLive()
                                    ? 'Gerencie plano e pagamento pelo checkout seguro (PIX, boleto ou cartão).'
                                    : 'Cobrança em preparação. Você pode abrir a prévia da tela de planos abaixo.'}
                            </p>
                            <Link
                                to="/planos"
                                className="btn btn-primary"
                                style={{ marginTop: 14, display: 'inline-block', textDecoration: 'none' }}
                            >
                                {isBillingLive() ? 'Ver planos e pagar' : 'Ver prévia dos planos'}
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
};

export default UserAccount;
