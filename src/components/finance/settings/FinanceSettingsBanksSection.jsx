import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import ModalShell from '../../shared/ModalShell.jsx';
import EmptyState from '../../shared/EmptyState.jsx';
import { DateInputField } from '../../DateInput';
import { maskCurrency } from '../../../lib/masks.js';
import { PAYMENT_METHODS } from '../../../lib/paymentMethods.js';
import {
  listBankAccountLabels,
  isUsableBankAccount,
  normalizeBankAccountEntry,
  hasCustomAcquirerFees,
  usesDefaultAcquirerFees,
} from '../../../lib/bankAccounts.js';
import { defaultAcquirerFees, normalizeAcquirerFees } from '../../../lib/acquirerFees.js';
import { FINANCE_TERM_HINTS } from '../../../lib/financeTermHints.js';
import FieldError from '../../shared/FieldError.jsx';
import { readDefaultAccountByMethod } from '../../../lib/paymentMethodBankDefaults.js';
import FinanceSettingsAcquirerFeesFields from './FinanceSettingsAcquirerFeesFields.jsx';

const EMPTY_BANK = {
  bankName: '',
  branch: '',
  account: '',
  accountName: '',
  pixKey: '',
  openingBalance: '',
  openingBalanceDate: '',
  useDefaultAcquirerFees: true,
  acquirerFees: defaultAcquirerFees(),
};

function bankCardLabel(acc) {
  const bank = String(acc?.bankName || '').trim();
  const pix = String(acc?.pixKey || '').trim();
  if (bank && pix) return `${bank} · PIX ${pix.slice(0, 12)}${pix.length > 12 ? '…' : ''}`;
  if (bank) return bank;
  if (pix) return `PIX ${pix}`;
  return 'Conta sem nome';
}

function bankCardSub(acc) {
  const parts = [];
  if (acc?.branch) parts.push(`Ag. ${acc.branch}`);
  if (acc?.account) parts.push(`Cc. ${acc.account}`);
  if (acc?.accountName) parts.push(acc.accountName);
  return parts.join(' · ') || 'Toque para completar os dados';
}

export default function FinanceSettingsBanksSection({
  financeConfig,
  setFinanceConfig,
  onSaveBank,
  onRemoveRequest,
}) {
  const [editIdx, setEditIdx] = useState(null);
  const [draft, setDraft] = useState(EMPTY_BANK);
  const [draftError, setDraftError] = useState('');
  const [feesPanelOpen, setFeesPanelOpen] = useState(true);
  const accounts = financeConfig.bankAccounts || [];
  const accountLabels = listBankAccountLabels(financeConfig);
  const defaultByMethod = readDefaultAccountByMethod(financeConfig);
  const usesDefaultFees = usesDefaultAcquirerFees(draft);

  const openEdit = (idx) => {
    setEditIdx(idx);
    setDraftError('');
    setFeesPanelOpen(true);
    const acc = accounts[idx] || {};
    const ob = Number(acc.openingBalance);
    setDraft({
      ...EMPTY_BANK,
      ...acc,
      useDefaultAcquirerFees: acc.useDefaultAcquirerFees !== false,
      acquirerFees: normalizeAcquirerFees(
        acc.useDefaultAcquirerFees === false ? acc.acquirerFees : financeConfig?.acquirerFees || defaultAcquirerFees()
      ),
      openingBalance:
        Number.isFinite(ob) && ob > 0
          ? maskCurrency(String(Math.round(ob * 100)))
          : ob === 0
            ? ''
            : String(acc.openingBalance ?? ''),
    });
  };

  const openNew = () => {
    setEditIdx('new');
    setDraft({
      ...EMPTY_BANK,
      acquirerFees: normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees()),
    });
    setDraftError('');
    setFeesPanelOpen(false);
  };

  const closeModal = () => {
    setEditIdx(null);
    setDraft(EMPTY_BANK);
    setDraftError('');
  };

  const saveDraft = () => {
    if (editIdx == null) return;
    if (!isUsableBankAccount(normalizeBankAccountEntry(draft))) {
      setDraftError('Informe o banco, número da conta ou chave PIX.');
      return;
    }
    setDraftError('');
    onSaveBank(editIdx, draft);
    closeModal();
  };

  const patchDraft = (patch) => {
    setDraftError('');
    setDraft((d) => ({ ...d, ...patch }));
  };

  const toggleDefaultFees = (useDefault) => {
    patchDraft({
      useDefaultAcquirerFees: useDefault,
      ...(useDefault
        ? {}
        : {
            acquirerFees: normalizeAcquirerFees(
              draft.acquirerFees || financeConfig?.acquirerFees || defaultAcquirerFees()
            ),
          }),
    });
    if (!useDefault) setFeesPanelOpen(true);
  };

  return (
    <div id="contas" className="finance-settings-section-body">
      <p className="text-small text-muted">
        Dados exibidos em comprovantes e no cálculo de saldo do Caixa (saldo inicial + movimentações
        liquidadas). Se usar mais de uma maquininha, configure as taxas em cada conta.
      </p>

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Adicione banco ou chave PIX para recebimentos."
          primaryAction={{ label: 'Adicionar conta', onClick: openNew }}
        />
      ) : (
        <div className="finance-settings-bank-list">
          {accounts.map((acc, idx) => (
            <div key={`bank-${idx}`} className="finance-settings-bank-card card">
              <button type="button" className="finance-settings-bank-card__main" onClick={() => openEdit(idx)}>
                <span className="finance-settings-bank-card__title-row">
                  <span className="finance-settings-bank-card__title">{bankCardLabel(acc)}</span>
                  {hasCustomAcquirerFees(acc) ? (
                    <span className="finance-settings-bank-card__badge">Taxas próprias</span>
                  ) : null}
                </span>
                <span className="finance-settings-bank-card__sub text-small text-muted">{bankCardSub(acc)}</span>
              </button>
              <div className="finance-settings-bank-card__actions">
                <button type="button" className="btn-outline btn-sm" aria-label="Editar" onClick={() => openEdit(idx)}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  aria-label="Remover"
                  onClick={() => onRemoveRequest(idx)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 ? (
        <button type="button" className="finance-settings-add-row edit-link" onClick={openNew}>
          <Plus size={16} aria-hidden />
          Adicionar conta
        </button>
      ) : null}

      {accounts.length > 0 && setFinanceConfig ? (
        <div className="finance-settings-inset card finance-settings-method-accounts">
          <h3 className="finance-settings-subtitle">Conta padrão por forma de pagamento</h3>
          <p className="text-small text-muted">
            Ao registrar um pagamento, a conta é preenchida automaticamente conforme o método escolhido.
          </p>
          <div className="finance-settings-method-accounts__grid">
            {PAYMENT_METHODS.map(({ value, label }) => (
              <div key={value} className="form-group">
                <label>{label}</label>
                <select
                  className="form-input"
                  value={defaultByMethod[value] || ''}
                  onChange={(e) => {
                    const next = String(e.target.value || '').trim();
                    setFinanceConfig((prev) => {
                      const current = readDefaultAccountByMethod(prev);
                      const updated = { ...current };
                      if (next) updated[value] = next;
                      else delete updated[value];
                      return { ...prev, defaultAccountByMethod: updated };
                    });
                  }}
                >
                  <option value="">Padrão geral</option>
                  {accountLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Link to="/financeiro?tab=movimentacoes" className="finance-config-context-link">
        Ver lançamentos →
      </Link>

      <ModalShell
        open={editIdx != null}
        title={editIdx === 'new' ? 'Nova conta' : 'Editar conta'}
        onClose={closeModal}
        maxWidth={600}
        dialogClassName="navi-modal-shell--scroll-body finance-bank-account-modal"
        footer={
          <div className="finance-bank-modal-footer">
            <button type="button" className="btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={saveDraft}>
              Aplicar
            </button>
          </div>
        }
      >
        <div className="finance-bank-modal-form">
          {draftError ? <FieldError>{draftError}</FieldError> : null}
          <p className="text-small text-muted finance-bank-modal-form__intro">
            Preencha o banco com número da conta, ou informe uma chave PIX.
          </p>

          <div className="finance-bank-modal-form__section">
            <p className="finance-bank-modal-form__section-label ctx-label">Dados bancários</p>
            <div className="finance-bank-modal-form__row finance-bank-modal-form__row--2">
              <div className="form-group">
                <label htmlFor="bank-draft-name">Banco</label>
                <input
                  id="bank-draft-name"
                  className="form-input"
                  value={draft.bankName || ''}
                  onChange={(e) => patchDraft({ bankName: e.target.value })}
                  autoComplete="organization"
                />
              </div>
              <div className="form-group">
                <label htmlFor="bank-draft-branch">Agência</label>
                <input
                  id="bank-draft-branch"
                  className="form-input"
                  value={draft.branch || ''}
                  onChange={(e) => patchDraft({ branch: e.target.value })}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="finance-bank-modal-form__row finance-bank-modal-form__row--2">
              <div className="form-group">
                <label htmlFor="bank-draft-account">Conta</label>
                <input
                  id="bank-draft-account"
                  className="form-input"
                  value={draft.account || ''}
                  onChange={(e) => patchDraft({ account: e.target.value })}
                  inputMode="numeric"
                />
              </div>
              <div className="form-group">
                <label htmlFor="bank-draft-holder">Titular</label>
                <input
                  id="bank-draft-holder"
                  className="form-input"
                  value={draft.accountName || ''}
                  onChange={(e) => patchDraft({ accountName: e.target.value })}
                  autoComplete="name"
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="bank-draft-pix">Chave PIX</label>
              <input
                id="bank-draft-pix"
                className="form-input"
                value={draft.pixKey || ''}
                onChange={(e) => patchDraft({ pixKey: e.target.value })}
              />
            </div>
          </div>

          <div className="finance-bank-modal-form__section">
            <p className="finance-bank-modal-form__section-label ctx-label">Saldo inicial no Caixa</p>
            <div className="finance-bank-modal-form__row finance-bank-modal-form__row--2">
              <div className="form-group">
                <label htmlFor="bank-draft-opening">Saldo inicial (R$)</label>
                <input
                  id="bank-draft-opening"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={draft.openingBalance ?? ''}
                  onChange={(e) => {
                    setDraftError('');
                    const d = e.target.value.replace(/\D/g, '');
                    if (!d) {
                      setDraft((prev) => ({ ...prev, openingBalance: '' }));
                      return;
                    }
                    const n = parseInt(d, 10) / 100;
                    setDraft((prev) => ({
                      ...prev,
                      openingBalance: maskCurrency(String(Math.round(n * 100))),
                    }));
                  }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="bank-draft-opening-date">Válido a partir de</label>
                <DateInputField
                  id="bank-draft-opening-date"
                  className="form-input"
                  type="date"
                  value={draft.openingBalanceDate || ''}
                  onChange={(e) => patchDraft({ openingBalanceDate: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <p className="text-small text-muted finance-bank-modal-form__hint">
              Se vazio, o saldo inicial vale para todo o histórico no Caixa.
            </p>
          </div>

          <div className="finance-bank-fees-panel card">
            <button
              type="button"
              className="finance-bank-fees-panel__header"
              aria-expanded={feesPanelOpen}
              aria-controls="bank-draft-fees-body"
              onClick={() => setFeesPanelOpen((v) => !v)}
            >
              <span className="finance-bank-fees-panel__icon" aria-hidden>
                <CreditCard size={18} />
              </span>
              <span className="finance-bank-fees-panel__titles">
                <span className="finance-bank-fees-panel__title">Taxas desta conta / maquininha</span>
                <span className="text-small text-muted finance-bank-fees-panel__lead">
                  {FINANCE_TERM_HINTS.maquininhaPorConta}
                </span>
              </span>
              <span className="finance-bank-fees-panel__chevron" aria-hidden>
                {feesPanelOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </span>
            </button>

            {feesPanelOpen ? (
              <div id="bank-draft-fees-body" className="finance-bank-fees-panel__body">
                <label className="finance-bank-fees-toggle">
                  <input
                    type="checkbox"
                    className="finance-bank-fees-toggle__input"
                    checked={usesDefaultFees}
                    onChange={(e) => toggleDefaultFees(e.target.checked)}
                  />
                  <span className="finance-bank-fees-toggle__track" aria-hidden />
                  <span className="finance-bank-fees-toggle__label">Usar as taxas padrão da academia</span>
                </label>

                {!usesDefaultFees ? (
                  <FinanceSettingsAcquirerFeesFields
                    fees={draft.acquirerFees}
                    onChange={(updater) =>
                      patchDraft({
                        acquirerFees: updater(
                          normalizeAcquirerFees(draft.acquirerFees || defaultAcquirerFees())
                        ),
                      })
                    }
                    idPrefix="bank-draft-acquirer"
                    showSummary
                    showAnticipation
                    compact
                  />
                ) : (
                  <p className="text-small text-muted finance-bank-fees-panel__default-note">
                    As taxas em Minha Academia → Taxas serão usadas para pagamentos nesta conta.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
