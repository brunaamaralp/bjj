import React from 'react';
import {
  acquirerFeesSummary,
  defaultAcquirerFees,
  normalizeAcquirerFees,
} from '../../../lib/acquirerFees.js';
import {
  filterBankAccountsWithBank,
  formatBankAccountLabel,
  hasCustomAcquirerFees,
} from '../../../lib/bankAccounts.js';
import { FINANCE_TERM_HINTS } from '../../../lib/financeTermHints.js';
import StatusBanner from '../../shared/StatusBanner.jsx';
import FinanceSettingsAcquirerFeesFields from './FinanceSettingsAcquirerFeesFields.jsx';

export default function FinanceSettingsAcquirerFeesSection({ financeConfig, setFinanceConfig }) {
  const acquirerFees = normalizeAcquirerFees(financeConfig?.acquirerFees || defaultAcquirerFees());
  const customAccounts = filterBankAccountsWithBank(financeConfig?.bankAccounts).filter(
    hasCustomAcquirerFees
  );

  const patchAcquirer = (updater) => {
    setFinanceConfig((prev) => {
      const current = normalizeAcquirerFees(prev.acquirerFees);
      return { ...prev, acquirerFees: updater(current) };
    });
  };

  return (
    <div className="finance-settings-section-body mt-4 finance-settings-acquirer">
      <hr className="finance-settings-section-divider" aria-hidden />
      <h3 className="finance-settings-subtitle">Taxas padrão da maquininha</h3>
      <p className="finance-settings-lead">
        Taxa da maquininha: percentual descontado do valor recebido antes de cair na conta. Estas são
        as taxas padrão da academia, usadas quando a conta do pagamento não tiver taxas próprias. Não
        confunda com o repasse ao aluno (acréscimo na mensalidade).
      </p>

      <StatusBanner variant="info" className="mb-3">
        {FINANCE_TERM_HINTS.previsaoMdrOpcional}
      </StatusBanner>

      {customAccounts.length > 0 ? (
        <div className="finance-settings-account-fees-overview card" role="status">
          <p className="finance-settings-account-fees-overview__title ctx-label">
            Contas com taxas próprias
          </p>
          <ul className="finance-settings-account-fees-overview__list">
            {customAccounts.map((acc) => {
              const label = formatBankAccountLabel(acc);
              return (
                <li key={label} className="finance-settings-account-fees-overview__item">
                  <span className="finance-settings-account-fees-overview__name">{label}</span>
                  <span className="text-small text-muted">
                    {acquirerFeesSummary(acc.acquirerFees)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-small text-muted finance-settings-account-fees-overview__hint">
            Edite em Recebimento → conta → Taxas desta conta / maquininha.
          </p>
        </div>
      ) : null}

      <FinanceSettingsAcquirerFeesFields
        fees={acquirerFees}
        onChange={patchAcquirer}
        idPrefix="finance-acquirer-global"
        showSummary
        showAnticipation
      />

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
          <option value="absorb">
            A academia paga a taxa da maquininha (recomendado)
          </option>
          <option value="pass_through">
            Já está no preço cobrado do aluno (use com repasse nos planos)
          </option>
        </select>
        <p className="text-small text-muted">
          Quando a academia paga, o líquido no Caixa é o valor bruto menos a taxa da maquininha.
        </p>
      </div>
    </div>
  );
}
