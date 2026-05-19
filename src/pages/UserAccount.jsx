import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, User } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { onboardingDismissStorageKey } from '../lib/onboardingChecklist.js';
import { authService } from '../lib/auth';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import PlansTabContent from '../components/account/PlansTabContent.jsx';
import { useUiStore } from '../store/useUiStore';
import { useTerms } from '../lib/terminology.js';

const ACCOUNT_TABS = new Set(['perfil', 'assinatura', 'seguranca']);
const MIN_PWD = 8;

function userInitial(email) {
  const s = String(email || '').trim();
  if (!s) return '?';
  return s[0].toUpperCase();
}

const UserAccount = ({ user }) => {
  const terms = useTerms();
  const [searchParams, setSearchParams] = useSearchParams();
  const academyId = useLeadStore((s) => s.academyId);
  const reopenOnboardingBanner = useLeadStore((s) => s.reopenOnboardingBanner);
  const addToast = useUiStore((s) => s.addToast);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const activeTab = resolveHubTab(searchParams.get('tab'), ACCOUNT_TABS, 'perfil');

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!ACCOUNT_TABS.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

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
      addToast({ type: 'info', message: `Selecione uma ${terms.workspaceNoun} primeiro.` });
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

  const email = user?.email || '';
  const displayName = String(user?.name || '').trim() || email.split('@')[0] || 'Conta';

  const tabs = [
    { id: 'perfil', label: 'Perfil' },
    { id: 'assinatura', label: 'Assinatura' },
    { id: 'seguranca', label: 'Segurança' },
  ];

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <div className="animate-in" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div
          style={{
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
          }}
        >
          {userInitial(email)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 className="navi-page-title" style={{ margin: 0 }}>Minha conta</h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.4 }}>
            {email || displayName}
          </p>
        </div>
      </div>

      <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Conta" />

      <div style={{ marginTop: 20 }}>
        {activeTab === 'perfil' && (
          <section className="animate-in">
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <User size={18} style={{ color: 'var(--accent)' }} aria-hidden />
              <div>
                <strong className="text-small">{displayName}</strong>
                <p className="navi-subtitle" style={{ margin: '4px 0 0' }}>{email || '—'}</p>
              </div>
            </div>
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
                title={!academyId ? `Selecione uma ${terms.workspaceNoun} primeiro` : undefined}
              >
                Mostrar checklist
              </button>
            </div>
          </section>
        )}

        {activeTab === 'assinatura' && <PlansTabContent />}

        {activeTab === 'seguranca' && (
          <section className="animate-in">
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-light)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
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
        )}
      </div>
    </div>
  );
};

export default UserAccount;

