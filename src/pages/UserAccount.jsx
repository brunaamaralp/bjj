import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Shield, User, X } from 'lucide-react';
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

const ACCOUNT_TABS = new Set(['perfil', 'assinatura', 'seguranca', 'dados']);
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
    { id: 'seguranca', label: 'Segurança' },
    { id: 'dados', label: 'Dados' },
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
          <h1 className="navi-page-title" style={{ margin: 0 }}>Minha conta</h1>
          <p className="navi-subtitle" style={{ margin: '4px 0 0', wordBreak: 'break-all' }}>
            Gerencie perfil, assinatura e segurança.
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.4 }}>
            {email || displayName}
          </p>
        </div>
      </div>

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
            </div>
          </section>
        )}

        {activeTab === 'assinatura' && <PlansTabContent />}

        {activeTab === 'dados' && (
          <section className="animate-in">
            <AvancadoSection academy={academyForRole} leads={leads} showAutentique={false} />
          </section>
        )}

        {activeTab === 'seguranca' && (
          <section className="animate-in">
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
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

      {pwdModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="navi-modal-overlay" role="presentation" onClick={closePasswordModal}>
              <div
                className="card navi-modal-dialog"
                role="dialog"
                aria-modal="true"
                style={{ maxWidth: 420, padding: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
                  <h3 className="navi-section-heading" style={{ margin: 0 }}>
                    Alterar senha
                  </h3>
                  <button type="button" className="btn-outline btn-sm" onClick={closePasswordModal} aria-label="Fechar">
                    <X size={16} />
                  </button>
                </div>
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
                  <div className="flex gap-2 justify-end">
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
              </div>
            </div>,
            document.body
          )
        : null}
      </div>
    </div>
  );
};

export default UserAccount;

