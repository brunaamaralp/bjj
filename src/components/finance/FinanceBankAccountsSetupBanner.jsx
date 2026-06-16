import React from 'react';
import { Link } from 'react-router-dom';
import StatusBanner from '../shared/StatusBanner.jsx';
import { hasConfiguredBankAccounts } from '../../lib/bankAccounts.js';
import { EMPRESA_FINANCE_ACCOUNTS_PATH } from '../../lib/financeiroHubTabs.js';

/**
 * Aviso quando não há conta bancária utilizável — bloqueia pagamentos e lançamentos com conta.
 */
export default function FinanceBankAccountsSetupBanner({
  financeConfig,
  canConfigure = false,
  className = 'mb-3',
}) {
  if (hasConfiguredBankAccounts(financeConfig)) return null;

  return (
    <StatusBanner variant="warning" className={className}>
      {canConfigure ? (
        <>
          Configure ao menos uma conta de recebimento (banco, número da conta ou PIX) para registrar
          pagamentos e lançamentos.{' '}
          <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Configurar agora →</Link>
        </>
      ) : (
        <>
          Para registrar pagamentos e lançamentos, o titular ou administrador precisa cadastrar uma conta
          em Minha academia → Financeiro → Recebimento.
        </>
      )}
    </StatusBanner>
  );
}
