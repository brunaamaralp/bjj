import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import ModalShell from '../../shared/ModalShell.jsx';
import StatusBanner from '../../shared/StatusBanner.jsx';
import FieldError from '../../shared/FieldError.jsx';
import ConfirmDialog from '../../shared/ConfirmDialog.jsx';
import { FINANCE_TERM_HINTS } from '../../../lib/financeTermHints.js';
import { listBankAccountLabels } from '../../../lib/bankAccounts.js';
import {
  countFeeReceiverUsages,
  defaultFeeReceiver,
  emptyFeeReceiverFeeTable,
  feeReceiverSummary,
  FEE_RECEIVER_PROVIDERS,
  FEE_RECEIVER_PROVIDER_LABELS,
  findFeeReceiverById,
  normalizeFeeReceiver,
  readFeeReceivers,
  applyFeeReceiverDraftToFinanceConfig,
} from '../../../lib/feeReceivers.js';
import { FINANCE_SETTINGS_SECTIONS } from '../../../lib/financeSettingsSections.js';
import FeeReceiverMatrix from './FeeReceiverMatrix.jsx';

function patchReceivers(setFinanceConfig, updater) {
  setFinanceConfig((prev) => {
    const list = readFeeReceivers(prev);
    const next = updater(list).map(normalizeFeeReceiver).filter(Boolean);
    const defaultId =
      String(prev.defaultFeeReceiverId || '').trim() ||
      next.find((r) => r.name === 'Padrão academia')?.id ||
      next[0]?.id ||
      '';
    return {
      ...prev,
      feeReceivers: next,
      defaultFeeReceiverId: defaultId,
      feeReceiversMigrated: true,
    };
  });
}

export default function FinanceSettingsFeeReceiversSection({
  financeConfig,
  setFinanceConfig,
  onPersistFinanceConfig,
  saving = false,
}) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftError, setDraftError] = useState('');
  const [removeTarget, setRemoveTarget] = useState(null);

  const receivers = useMemo(() => readFeeReceivers(financeConfig), [financeConfig]);
  const accountLabels = listBankAccountLabels(financeConfig);
  const defaultId = String(financeConfig?.defaultFeeReceiverId || '').trim();
  const defaultReceiver = findFeeReceiverById(financeConfig, defaultId) || receivers[0];

  const openNew = () => {
    setEditId('new');
    setDraftError('');
    setDraft(
      defaultFeeReceiver({
        name: '',
        bankAccountLabel: accountLabels[0] || '',
      })
    );
  };

  const openEdit = (receiver) => {
    setEditId(receiver.id);
    setDraftError('');
    setDraft(
      normalizeFeeReceiver({
        ...receiver,
        fees: receiver.useDefaultFees
          ? emptyFeeReceiverFeeTable()
          : receiver.fees || emptyFeeReceiverFeeTable(),
      })
    );
  };

  const closeModal = () => {
    setEditId(null);
    setDraft(null);
    setDraftError('');
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = String(draft.name || '').trim();
    if (!name) {
      setDraftError('Informe o nome do recebedor.');
      return;
    }
    setDraftError('');
    const normalized = normalizeFeeReceiver({ ...draft, name });
    if (!normalized) return;
    patchReceivers(setFinanceConfig, (list) => {
      if (editId === 'new') return [...list, normalized];
      return list.map((r) => (r.id === normalized.id ? normalized : r));
    });
    closeModal();
  };

  const saveDraftAndPersist = async () => {
    if (!draft) return;
    const name = String(draft.name || '').trim();
    if (!name) {
      setDraftError('Informe o nome do recebedor.');
      return;
    }
    if (typeof onPersistFinanceConfig !== 'function') {
      saveDraft();
      return;
    }
    setDraftError('');
    const nextFinanceConfig = applyFeeReceiverDraftToFinanceConfig(financeConfig, editId, {
      ...draft,
      name,
    });
    const ok = await onPersistFinanceConfig(nextFinanceConfig);
    if (ok) closeModal();
  };

  const setAsDefault = (id) => {
    setFinanceConfig((prev) => ({ ...prev, defaultFeeReceiverId: id, feeReceiversMigrated: true }));
  };

  const removeReceiver = (receiver) => {
    const id = String(receiver?.id || '').trim();
    if (!id) return;
    setFinanceConfig((prev) => {
      const list = readFeeReceivers(prev).filter((r) => r.id !== id);
      const wasDefault = String(prev.defaultFeeReceiverId || '').trim() === id;
      const nextDefault = wasDefault
        ? list[0]?.id || ''
        : String(prev.defaultFeeReceiverId || '').trim() || list[0]?.id || '';
      const bankAccounts = (prev.bankAccounts || []).map((a) =>
        String(a?.feeReceiverId || '').trim() === id ? { ...a, feeReceiverId: '' } : a
      );
      const captureMethods = (prev.captureMethods || []).map((c) =>
        String(c?.feeReceiverId || '').trim() === id
          ? { ...c, feeReceiverId: nextDefault || '' }
          : c
      );
      return {
        ...prev,
        feeReceivers: list,
        defaultFeeReceiverId: nextDefault,
        bankAccounts,
        captureMethods,
        feeReceiversMigrated: true,
      };
    });
    if (editId === id) closeModal();
    setRemoveTarget(null);
  };

  const removeUsageHint = useMemo(() => {
    if (!removeTarget) return '';
    const { bankAccounts, captureMethods } = countFeeReceiverUsages(financeConfig, removeTarget.id);
    const parts = [];
    if (bankAccounts > 0) {
      parts.push(`${bankAccounts} conta${bankAccounts === 1 ? '' : 's'}`);
    }
    if (captureMethods > 0) {
      parts.push(`${captureMethods} meio${captureMethods === 1 ? '' : 's'} de captura`);
    }
    if (!parts.length) return '';
    return ` Vinculado a ${parts.join(' e ')} — passará a usar o recebedor padrão.`;
  }, [financeConfig, removeTarget]);

  const canDeleteReceivers = receivers.length > 1;

  return (
    <div className="finance-fee-receivers mt-4">
      <hr className="finance-settings-section-divider" aria-hidden />
      <h3 className="finance-settings-subtitle">Recebedores / maquininhas</h3>
      <p className="finance-settings-lead">
        Taxa da maquininha por recebedor (PagBank, Asaas, Stone…). Configure aqui todas as taxas —
        inclusive por bandeira (Visa, Master, Elo). Contas e formas de recebimento apenas vinculam o
        recebedor.
      </p>

      <StatusBanner variant="info" className="mb-3">
        {FINANCE_TERM_HINTS.previsaoMdrOpcional}
      </StatusBanner>

      {defaultReceiver ? (
        <div className="finance-fee-receivers__default card" role="status">
          <div className="finance-fee-receivers__default-head">
            <div>
              <p className="ctx-label finance-fee-receivers__default-label">Recebedor padrão</p>
              <p className="finance-fee-receivers__default-name">
                {defaultReceiver.name || 'Padrão academia'}
              </p>
              <p className="text-small text-muted">{feeReceiverSummary(defaultReceiver)}</p>
            </div>
            <div className="finance-fee-receivers__default-actions">
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={() => openEdit(defaultReceiver)}
              >
                <Pencil size={14} aria-hidden />
                Editar
              </button>
              {canDeleteReceivers ? (
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  aria-label={`Excluir recebedor ${defaultReceiver.name || 'padrão'}`}
                  onClick={() => setRemoveTarget(defaultReceiver)}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="finance-fee-receivers__list">
        {receivers
          .filter((r) => r.id !== defaultReceiver?.id)
          .map((r) => (
            <div key={r.id} className="finance-fee-receivers__item card">
              <div className="finance-fee-receivers__item-main">
                <p className="finance-fee-receivers__item-name">
                  {r.name || FEE_RECEIVER_PROVIDER_LABELS[r.provider] || 'Recebedor'}
                </p>
                <p className="text-small text-muted">
                  {r.bankAccountLabel || 'Sem conta'}{' '}
                  {r.provider ? `· ${FEE_RECEIVER_PROVIDER_LABELS[r.provider] || r.provider}` : ''}
                </p>
                <p className="text-small text-muted">{feeReceiverSummary(r)}</p>
              </div>
              <div className="finance-fee-receivers__item-actions">
                {r.id !== defaultId ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setAsDefault(r.id)}
                  >
                    Tornar padrão
                  </button>
                ) : (
                  <span className="finance-fee-receivers__badge">Padrão</span>
                )}
                <button type="button" className="btn-outline btn-sm" onClick={() => openEdit(r)} aria-label={`Editar recebedor ${r.name || FEE_RECEIVER_PROVIDER_LABELS[r.provider] || ''}`}>
                  <Pencil size={14} aria-hidden />
                </button>
                {canDeleteReceivers ? (
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    aria-label={`Excluir recebedor ${r.name || FEE_RECEIVER_PROVIDER_LABELS[r.provider] || ''}`}
                    onClick={() => setRemoveTarget(r)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
      </div>

      <button type="button" className="finance-settings-add-row edit-link" onClick={openNew}>
        <Plus size={16} aria-hidden />
        Adicionar recebedor
      </button>

      <p className="text-small text-muted">
        Vincule recebedores em{' '}
        <Link
          to={`/empresa?tab=financeiro&section=${FINANCE_SETTINGS_SECTIONS.RECEBIMENTO}`}
          className="finance-config-context-link"
        >
          Contas bancárias
        </Link>{' '}
        e{' '}
        <Link
          to={`/empresa?tab=financeiro&section=${FINANCE_SETTINGS_SECTIONS.FORMAS}`}
          className="finance-config-context-link"
        >
          Formas de recebimento
        </Link>
        .
      </p>

      <div className="form-group mb-3 finance-acquirer-policy">
        <label htmlFor="finance-acquirer-fee-policy">Quem paga a taxa da maquininha?</label>
        <select
          id="finance-acquirer-fee-policy"
          className="form-input"
          value={financeConfig?.acquirerFeePolicy || 'absorb'}
          onChange={(e) =>
            setFinanceConfig((prev) => ({
              ...prev,
              acquirerFeePolicy: e.target.value,
            }))
          }
        >
          <option value="absorb">A academia paga a taxa da maquininha (recomendado)</option>
          <option value="pass_through">Já está no preço cobrado do aluno (use com repasse nos planos)</option>
        </select>
      </div>

      <ModalShell
        open={editId != null && draft != null}
        title={editId === 'new' ? 'Novo recebedor' : 'Editar recebedor'}
        onClose={closeModal}
        maxWidth={720}
        dialogClassName="navi-modal-shell--scroll-body"
        footer={
          <div className="finance-bank-modal-footer">
            <button type="button" className="btn-outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void saveDraftAndPersist()}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {draft ? (
          <div className="finance-fee-receiver-modal">
            <div className="form-group">
              <label htmlFor="fee-recv-name">Nome</label>
              <input
                id="fee-recv-name"
                className="form-input"
                value={draft.name}
                placeholder="Ex.: PagBank PJ, Asaas link"
                aria-invalid={draftError ? 'true' : undefined}
                aria-describedby={draftError ? 'fee-recv-name-error' : undefined}
                onChange={(e) => {
                  setDraftError('');
                  setDraft((d) => ({ ...d, name: e.target.value }));
                }}
              />
              <FieldError id="fee-recv-name-error">{draftError}</FieldError>
            </div>
            <div className="finance-fee-receiver-modal__row">
              <div className="form-group">
                <label htmlFor="fee-recv-provider">Provedor</label>
                <select
                  id="fee-recv-provider"
                  className="form-input"
                  value={draft.provider || 'manual'}
                  onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value }))}
                >
                  {FEE_RECEIVER_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {FEE_RECEIVER_PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="fee-recv-account">Conta destino</label>
                <select
                  id="fee-recv-account"
                  className="form-input"
                  value={draft.bankAccountLabel || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, bankAccountLabel: e.target.value }))}
                >
                  <option value="">Nenhuma</option>
                  {accountLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="finance-bank-fees-toggle">
              <input
                type="checkbox"
                checked={draft.useDefaultFees === true}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    useDefaultFees: e.target.checked,
                    ...(e.target.checked ? {} : { fees: d.fees || emptyFeeReceiverFeeTable() }),
                  }))
                }
              />
              <span>Usar taxas do recebedor padrão da academia</span>
            </label>

            {draft.useDefaultFees !== true ? (
              <FeeReceiverMatrix
                fees={draft.fees}
                idPrefix={`fee-recv-${draft.id}`}
                onChange={(fees) => setDraft((d) => ({ ...d, fees }))}
              />
            ) : null}
          </div>
        ) : null}
      </ModalShell>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Excluir recebedor"
        description={
          removeTarget
            ? `Excluir "${removeTarget.name || FEE_RECEIVER_PROVIDER_LABELS[removeTarget.provider] || 'Recebedor'}"?${removeUsageHint} Pagamentos já registrados mantêm o histórico.`
            : ''
        }
        confirmLabel="Excluir"
        confirmVariant="danger"
        onConfirm={() => removeTarget && removeReceiver(removeTarget)}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
