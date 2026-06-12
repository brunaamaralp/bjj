import '../styles/settings-pages.css';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, User } from 'lucide-react';
import { useLeadStore } from '../store/useLeadStore';
import { onboardingDismissStorageKey } from '../lib/onboardingChecklist.js';
import { authService } from '../lib/auth';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import PlansTabContent from '../components/account/PlansTabContent.jsx';
import AvancadoSection from '../components/academy/AvancadoSection';
import { useUiStore } from '../store/useUiStore';
import FieldError from '../components/shared/FieldError.jsx';
import { useTerms } from '../lib/terminology.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import ModalShell from '../components/shared/ModalShell.jsx';

const ACCOUNT_TABS = new Set(['perfil', 'assinatura', 'dados']);
const MIN_PWD = 8;

const UserAccount = ({ user }) => {
  const terms = useTerms();
  const [searchParams, setSearchParams] = useSearchParams();
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const leads = useLeadStore((s) => s.leads);
  const reopenOnboardingBanner = useLeadStore((s) => s.reopenOnboardingBanner);
  const addToast = useUiStore((s) => s.addToast);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdInlineError, setPwdInlineError] = useState('');

  const activeTab = resolveHubTab(searchParams.get('tab'), ACCOUNT_TABS, 'perfil');

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (t === 'seguranca') {
      setSearchParams({ tab: 'perfil' }, { replace: true });
      return;
    }
    if (!ACCOUNT_TABS.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const openPasswordModal = () => {
    setPwdInlineError('');
    setPwdModalOpen(true);
  };

  const closePasswordModal = () => {
    if (pwdSaving) return;
    setPwdModalOpen(false);
    setPwdInlineError('');
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwdInlineError('');
    const oldP = String(oldPassword || '');
    const newP = String(newPassword || '');
    const conf = String(confirmPassword || '');
    if (newP.length < MIN_PWD) {
      setPwdInlineError(`A nova senha deve ter pelo menos ${MIN_PWD} caracteres.`);
      return;
    }
    if (newP !== conf) {
      setPwdInlineError('A confirmação não coincide com a nova senha.');
      return;
    }
    setPwdSaving(true);
    try {
      await authService.updatePassword(newP, oldP);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdModalOpen(false);
      addToast({ type: 'success', message: 'Senha alterada com sucesso' });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/password|senha|invalid credentials|401|old password/i.test(msg)) {
        setPwdInlineError('Senha atual incorreta');
      } else {
        setPwdInlineError(msg || 'Não foi possível alterar a senha.');
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

  const academyForRole = React.useMemo(() => {
    const fromList = (academyList || []).find((a) => a.id === academyId);
    return {
      ownerId: String(fromList?.ownerId || ''),
      teamId: String(fromList?.teamId || ''),
    };
  }, [academyList, academyId]);

  const tabs = [
    { id: 'perfil', label: 'Perfil' },
    { id: 'assinatura', label: 'Assinatura' },
    { id: 'dados', label: 'Avançado' },
  ];

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  return (
    <div className="container navi-hub-page">
      <PageHeader
        className="navi-page-header--flush"
        title="Minha conta"
        subtitle="Perfil, assinatura e preferências da conta."
        meta={email || displayName}
      />

      <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Conta" fullWidth />

      <div style={{ marginTop: 20 }}>
        {activeTab === 'perfil' && (
          <section className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Card de perfil com avatar de iniciais */}
            <div className="account-profile-card">
              <div className="account-profile-card__avatar" aria-hidden>
                {displayName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0].toUpperCase())
                  .join('') || <User size={20} />}
              </div>
              <div className="account-profile-card__info">
                <p className="account-profile-card__name">{displayName}</p>
                <p className="account-profile-card__email">{email || '—'}</p>
              </div>
            </div>

            {/* Settings card — linha de senha */}
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row__icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  <Shield size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="settings-row__label" style={{ marginBottom: 2 }}>Senha da conta</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                    Mínimo {MIN_PWD} caracteres
                  </p>
                </div>
                <button type="button" className="btn-outline navi-btn--toolbar" onClick={openPasswordModal}>
                  Alterar
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'assinatura' && <PlansTabContent user={user} />}

        {activeTab === 'dados' && (
          <section className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="settings-card">
              <div className="settings-row" style={{ flexWrap: 'wrap' }}>
                <p className="settings-row__label">Reexibir checklist de configuração</p>
                <button
                  type="button"
                  className="btn-outline navi-btn--toolbar"
                  onClick={showOnboardingChecklistAgain}
                  disabled={!academyId}
                  title={!academyId ? `Selecione uma ${terms.workspaceNoun} primeiro` : undefined}
                >
                  Mostrar checklist
                </button>
              </div>
            </div>
            <AvancadoSection academy={academyForRole} leads={leads} showAutentique={false} />
          </section>
        )}

      <ModalShell
        open={pwdModalOpen}
        title="Alterar senha"
        onClose={closePasswordModal}
        maxWidth={420}
      >
        <form className="settings-form" onSubmit={submitPassword}>
          <div className="form-group">
            <label htmlFor="acc-old-pwd">Senha atual</label>
            <input
              id="acc-old-pwd"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              disabled={pwdSaving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="acc-new-pwd">Nova senha</label>
            <input
              id="acc-new-pwd"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={pwdSaving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="acc-confirm-pwd">Confirmar nova senha</label>
            <input
              id="acc-confirm-pwd"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={pwdSaving}
            />
          </div>
          {pwdInlineError ? <FieldError>{pwdInlineError}</FieldError> : null}
          <div className="navi-modal-shell__footer" style={{ marginTop: 0 }}>
            <button type="button" className="btn-outline" onClick={closePasswordModal} disabled={pwdSaving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-secondary"
              disabled={pwdSaving || !oldPassword || !newPassword || !confirmPassword}
            >
              {pwdSaving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </ModalShell>
      </div>
    </div>
  );
};

export default UserAccount;

