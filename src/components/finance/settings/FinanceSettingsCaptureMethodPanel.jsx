import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { listBankAccountLabels } from '../../../lib/bankAccounts.js';
import {
  CAPTURE_CHANNEL_LABELS,
  defaultCaptureMethod,
  patchCaptureMethodsList,
  readCaptureMethods,
} from '../../../lib/captureMethods.js';
import { listFeeReceiverOptions } from '../../../lib/feeReceivers.js';
import { FINANCE_SETTINGS_SECTIONS } from '../../../lib/financeSettingsSections.js';
import ConfirmDialog from '../../shared/ConfirmDialog.jsx';

function patchCapture(setFinanceConfig, updater) {
  setFinanceConfig((prev) => {
    const list = readCaptureMethods(prev);
    return patchCaptureMethodsList(prev, updater(list));
  });
}

export default function FinanceSettingsCaptureMethodPanel({
  financeConfig,
  setFinanceConfig,
  paymentMethod,
}) {
  const [removeTarget, setRemoveTarget] = useState(null);
  const accountLabels = listBankAccountLabels(financeConfig);
  const receiverOptions = listFeeReceiverOptions(financeConfig);
  const defaultReceiverId = String(financeConfig?.defaultFeeReceiverId || '').trim();
  const methods = useMemo(
    () => readCaptureMethods(financeConfig).filter((c) => c.paymentMethod === paymentMethod),
    [financeConfig, paymentMethod]
  );

  const addMethod = () => {
    patchCapture(setFinanceConfig, (list) => [
      ...list,
      defaultCaptureMethod(paymentMethod),
    ]);
  };

  const updateMethod = (id, patch) => {
    patchCapture(setFinanceConfig, (list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const removeMethod = (id) => {
    patchCapture(setFinanceConfig, (list) => list.filter((c) => c.id !== id));
    setRemoveTarget(null);
  };

  const title =
    paymentMethod === 'cartao_debito' ? 'Meios de captura (débito)' : 'Meios de captura (crédito)';

  return (
    <div className="finance-capture-methods">
      <div className="finance-capture-methods__header">
        <div>
          <h4 className="finance-settings-subtitle">{title}</h4>
          <p className="text-small text-muted finance-settings-hint">
            Maquininhas, links ou integrações usadas nesta forma. Configure taxas em{' '}
            <Link
              to={`/empresa?tab=financeiro&section=${FINANCE_SETTINGS_SECTIONS.TAXAS}`}
              className="finance-config-context-link"
            >
              Taxas e recebedores
            </Link>{' '}
            e vincule o recebedor abaixo.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addMethod}>
          <Plus size={16} aria-hidden />
          Adicionar meio
        </button>
      </div>

      {methods.length === 0 ? (
        <p className="text-small text-muted finance-capture-methods__empty">
          Nenhum meio cadastrado — o sistema usa o recebedor da conta ou o padrão da academia.
        </p>
      ) : null}

      {methods.map((cap) => {
        const unnamedActive = cap.active !== false && !String(cap.name || '').trim();
        const customReceiver =
          cap.feeReceiverId && cap.feeReceiverId !== defaultReceiverId;
        return (
          <div key={cap.id} className="finance-capture-methods__item finance-settings-inset">
            <div className="finance-capture-methods__item-top">
              <label className="form-group finance-capture-methods__name">
                <span className="form-label">Nome do meio</span>
                <input
                  className={`form-input${unnamedActive ? ' form-input--error' : ''}`}
                  type="text"
                  maxLength={80}
                  placeholder="Ex.: Stone presencial, Link PagBank"
                  value={cap.name}
                  onChange={(e) => updateMethod(cap.id, { name: e.target.value })}
                  aria-invalid={unnamedActive ? 'true' : undefined}
                />
                {unnamedActive ? (
                  <p className="text-small finance-capture-methods__name-warning" role="status">
                    Meios ativos precisam de nome para aparecer claro no caixa e nas vendas.
                  </p>
                ) : null}
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm finance-capture-methods__remove"
                aria-label="Remover meio"
                onClick={() => setRemoveTarget(cap)}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="finance-capture-methods__item-toolbar">
              {customReceiver ? (
                <span className="finance-capture-methods__badge">Recebedor próprio</span>
              ) : (
                <span className="finance-capture-methods__badge finance-capture-methods__badge--muted">
                  Recebedor padrão
                </span>
              )}
              <label className="finance-capture-methods__active">
                <input
                  type="checkbox"
                  checked={cap.active !== false}
                  onChange={(e) => updateMethod(cap.id, { active: e.target.checked })}
                />
                <span>Ativo</span>
              </label>
            </div>

            <div className="finance-capture-methods__meta">
              <div className="form-group">
                <label className="form-label" htmlFor={`cap-channel-${cap.id}`}>
                  Canal
                </label>
                <select
                  id={`cap-channel-${cap.id}`}
                  className="form-input"
                  value={cap.channel}
                  onChange={(e) => updateMethod(cap.id, { channel: e.target.value })}
                >
                  {Object.entries(CAPTURE_CHANNEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`cap-account-${cap.id}`}>
                  Conta de destino
                </label>
                <select
                  id={`cap-account-${cap.id}`}
                  className="form-input"
                  value={cap.bankAccountLabel}
                  onChange={(e) => updateMethod(cap.id, { bankAccountLabel: e.target.value })}
                >
                  <option value="">Usar conta padrão da forma</option>
                  {accountLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor={`cap-receiver-${cap.id}`}>
                  Recebedor de taxas
                </label>
                <select
                  id={`cap-receiver-${cap.id}`}
                  className="form-input"
                  value={cap.feeReceiverId || defaultReceiverId || ''}
                  onChange={(e) => updateMethod(cap.id, { feeReceiverId: e.target.value })}
                >
                  {receiverOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-small text-muted mb-0">
                  <Link
                    to={`/empresa?tab=financeiro&section=${FINANCE_SETTINGS_SECTIONS.TAXAS}`}
                    className="finance-config-context-link"
                  >
                    Editar taxas deste recebedor
                  </Link>
                </p>
              </div>
              {paymentMethod === 'cartao_credito' ? (
                <div className="form-group">
                  <label className="form-label" htmlFor={`cap-max-${cap.id}`}>
                    Máx. parcelas
                  </label>
                  <input
                    id={`cap-max-${cap.id}`}
                    className="form-input"
                    type="number"
                    min={1}
                    max={12}
                    value={cap.maxInstallments}
                    onChange={(e) =>
                      updateMethod(cap.id, {
                        maxInstallments: Math.min(12, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remover meio de captura"
        description={
          removeTarget?.name
            ? `Remover "${removeTarget.name}"? Pagamentos já registrados mantêm o histórico; novos registros não poderão usar este meio.`
            : 'Remover este meio de captura? Pagamentos já registrados mantêm o histórico.'
        }
        confirmLabel="Remover"
        confirmVariant="danger"
        onConfirm={() => removeTarget && removeMethod(removeTarget.id)}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
