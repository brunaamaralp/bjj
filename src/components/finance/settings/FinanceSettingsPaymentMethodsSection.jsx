import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Circle, Search } from 'lucide-react';
import { listBankAccountLabels } from '../../../lib/bankAccounts.js';
import { PAYMENT_METHODS } from '../../../lib/paymentMethods.js';
import {
  isPaymentMethodConfigured,
  readPaymentMethodSettings,
} from '../../../lib/paymentMethodSettings.js';
import { FINANCE_SETTINGS_SECTIONS } from '../../../lib/financeSettingsSections.js';
import StatusBanner from '../../shared/StatusBanner.jsx';

function StatusMark({ ok, label }) {
  return (
    <span className={`finance-payment-method-status${ok ? ' finance-payment-method-status--ok' : ''}`}>
      {ok ? <Check size={16} aria-hidden /> : <Circle size={14} aria-hidden />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function patchMethodSettings(setFinanceConfig, method, patch) {
  setFinanceConfig((prev) => {
    const current = readPaymentMethodSettings(prev);
    const row = current[method] || {};
    return {
      ...prev,
      paymentMethodSettings: {
        ...(prev.paymentMethodSettings || {}),
        [method]: { ...row, ...patch },
      },
    };
  });
}

export default function FinanceSettingsPaymentMethodsSection({ financeConfig, setFinanceConfig }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(PAYMENT_METHODS[0]?.value || 'pix');

  const accountLabels = listBankAccountLabels(financeConfig);
  const settings = readPaymentMethodSettings(financeConfig);

  const filteredMethods = useMemo(() => {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    if (!q) return PAYMENT_METHODS;
    return PAYMENT_METHODS.filter((m) => m.label.toLowerCase().includes(q));
  }, [query]);

  const activeRow = settings[selected] || readPaymentMethodSettings(null)[selected];
  const selectedMeta = PAYMENT_METHODS.find((m) => m.value === selected);
  const showCreditDays = ['cartao_credito', 'cartao_debito', 'transferencia'].includes(selected);

  return (
    <div className="finance-settings-section-body finance-payment-methods">
      <p className="finance-settings-lead">
        Defina quais formas a recepção pode usar e qual conta recebe cada pagamento. Taxas de
        repasse ao aluno e da maquininha continuam em{' '}
        <Link to="/empresa?tab=financeiro&section=taxas" className="finance-config-context-link">
          Taxas de cartão
        </Link>
        .
      </p>

      {accountLabels.length === 0 ? (
        <StatusBanner variant="warning" className="mb-3">
          Cadastre ao menos uma conta em{' '}
          <Link
            to={`/empresa?tab=financeiro&section=${FINANCE_SETTINGS_SECTIONS.RECEBIMENTO}`}
            className="finance-config-context-link"
          >
            Contas bancárias
          </Link>{' '}
          antes de configurar as formas.
        </StatusBanner>
      ) : null}

      <div className="finance-payment-methods__layout">
        <div className="finance-payment-methods__list card">
          <div className="finance-payment-methods__search">
            <Search size={16} className="finance-payment-methods__search-icon" aria-hidden />
            <input
              type="search"
              className="form-input finance-payment-methods__search-input"
              placeholder="Pesquisar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Pesquisar forma de recebimento"
            />
          </div>

          <div className="finance-payment-methods__table" role="table" aria-label="Formas de recebimento">
            <div className="finance-payment-methods__head" role="row">
              <span role="columnheader">Forma</span>
              <span role="columnheader">Ativa</span>
              <span role="columnheader">OK</span>
            </div>
            {filteredMethods.map((method) => {
              const row = settings[method.value];
              const configured = isPaymentMethodConfigured(financeConfig, method.value);
              const isSelected = selected === method.value;
              return (
                <button
                  key={method.value}
                  type="button"
                  role="row"
                  className={`finance-payment-methods__row${isSelected ? ' finance-payment-methods__row--active' : ''}`}
                  onClick={() => setSelected(method.value)}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="finance-payment-methods__name" role="cell">
                    {method.label}
                  </span>
                  <span role="cell">
                    <StatusMark ok={row?.active !== false} label={row?.active !== false ? 'Ativa' : 'Inativa'} />
                  </span>
                  <span role="cell">
                    <StatusMark ok={configured} label={configured ? 'Configurada' : 'Pendente'} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="finance-payment-methods__detail card">
          <h3 className="finance-settings-subtitle">{selectedMeta?.label || 'Forma'}</h3>

          <div className="form-group">
            <label htmlFor={`pm-account-${selected}`}>Conta padrão</label>
            <select
              id={`pm-account-${selected}`}
              className="form-input"
              value={activeRow?.defaultBankAccountLabel || ''}
              disabled={!setFinanceConfig || accountLabels.length === 0}
              onChange={(e) =>
                patchMethodSettings(setFinanceConfig, selected, {
                  defaultBankAccountLabel: String(e.target.value || '').trim(),
                })
              }
            >
              <option value="">Padrão geral da academia</option>
              {accountLabels.map((lbl) => (
                <option key={lbl} value={lbl}>
                  {lbl}
                </option>
              ))}
            </select>
            <p className="text-small text-muted">
              Preenchida automaticamente ao registrar um pagamento com esta forma.
            </p>
          </div>

          <fieldset className="finance-payment-methods__toggles">
            <legend className="sr-only">Comportamento da forma</legend>

            <label className="finance-payment-methods__toggle">
              <input
                type="checkbox"
                checked={activeRow?.active !== false}
                disabled={!setFinanceConfig}
                onChange={(e) =>
                  patchMethodSettings(setFinanceConfig, selected, { active: e.target.checked })
                }
              />
              <span>
                <strong>Forma ativa</strong>
                <span className="text-small text-muted block">
                  Exibe esta opção em mensalidades, vendas e perfil do aluno.
                </span>
              </span>
            </label>

            <label className="finance-payment-methods__toggle">
              <input
                type="checkbox"
                checked={activeRow?.autoMarkReceived !== false}
                disabled={!setFinanceConfig}
                onChange={(e) =>
                  patchMethodSettings(setFinanceConfig, selected, {
                    autoMarkReceived: e.target.checked,
                  })
                }
              />
              <span>
                <strong>Marcar como recebido</strong>
                <span className="text-small text-muted block">
                  Ao registrar, o pagamento do aluno fica como recebido na hora.
                </span>
              </span>
            </label>

            <label className="finance-payment-methods__toggle">
              <input
                type="checkbox"
                checked={activeRow?.autoSettle !== false}
                disabled={!setFinanceConfig}
                onChange={(e) =>
                  patchMethodSettings(setFinanceConfig, selected, { autoSettle: e.target.checked })
                }
              />
              <span>
                <strong>Confirmar no caixa na hora</strong>
                <span className="text-small text-muted block">
                  Liquida o lançamento no Caixa na data em que você registra o pagamento. Desligado:
                  fica pendente até a data prevista ou liquidação manual.
                </span>
              </span>
            </label>

            {showCreditDays ? (
              <div className="form-group finance-payment-methods__credit-days">
                <label htmlFor={`pm-credit-days-${selected}`}>Dias para cair na conta</label>
                <input
                  id={`pm-credit-days-${selected}`}
                  type="number"
                  min={0}
                  max={365}
                  className="form-input"
                  style={{ maxWidth: 120 }}
                  disabled={!setFinanceConfig}
                  value={activeRow?.creditDays ?? 0}
                  onChange={(e) =>
                    patchMethodSettings(setFinanceConfig, selected, {
                      creditDays: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                    })
                  }
                />
                <p className="text-small text-muted">
                  Usado na previsão de caixa e na liquidação automática diária. Dias corridos.
                </p>
              </div>
            ) : null}
          </fieldset>

          <p className="text-small text-muted finance-payment-methods__taxas-hint">
            Repasse ao aluno e taxas da maquininha:{' '}
            <Link to="/empresa?tab=financeiro&section=taxas" className="finance-config-context-link">
              Taxas de cartão →
            </Link>
          </p>
        </div>
      </div>

      <Link to="/financeiro?tab=movimentacoes" className="finance-config-context-link">
        Ver lançamentos →
      </Link>
    </div>
  );
}
