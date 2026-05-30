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
    <div className="container navi-hub-page" style={{ paddingTop: 20, paddingBottom: 40 }}>
      <PageHeader
        className="navi-page-header--flush"
        title="Minha conta"
        subtitle="Perfil, assinatura e preferências da conta."
        meta={email || displayName}
      />

      <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Conta" fullWidth />

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
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  <strong className="text-small">Senha da conta</strong>
                  <p className="navi-subtitle" style={{ marginTop: 2 }}>
                    Altere sua senha de acesso (mínimo {MIN_PWD} caracteres).
                  </p>
                </div>
              </div>
              <button type="button" className="btn btn-secondary" onClick={openPasswordModal}>
                Alterar senha
              </button>
            </div>
          </section>
        )}

        {activeTab === 'assinatura' && <PlansTabContent />}

        {activeTab === 'dados' && (
          <section className="animate-in">
            <AvancadoSection academy={academyForRole} leads={leads} showAutentique={false} />
          </section>
        )}

      <ModalShell
        open={pwdModalOpen}
        title="Alterar senha"
        onClose={closePasswordModal}
        maxWidth={420}
      >
        <form className="flex-col gap-3" onSubmit={submitPassword}>
          <div className="form-group" style={{ marginBottom: 0 }}>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
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

