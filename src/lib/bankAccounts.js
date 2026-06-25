/** Contas bancárias da academia (financeConfig.bankAccounts). */

import {
  defaultAcquirerFees,
  hasAcquirerFeesConfigured,
  normalizeAcquirerFees,
} from './acquirerFees.js';

function parseOpeningBalanceDate(value) {
  const s = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Conta usa taxas padrão da academia (sem override por maquininha). */
export function usesDefaultAcquirerFees(acc) {
  return acc?.useDefaultAcquirerFees !== false;
}

/** Conta com tabela própria de taxas da maquininha. */
export function hasCustomAcquirerFees(acc) {
  return !usesDefaultAcquirerFees(acc) && hasAcquirerFeesConfigured(acc?.acquirerFees);
}

/** Normaliza entrada de conta (cadastro + saldo inicial + taxas opcionais). */
export function normalizeBankAccountEntry(raw) {
  const acc = raw && typeof raw === 'object' ? raw : {};
  const openingRaw = Number(acc.openingBalance);
  const openingBalance = Number.isFinite(openingRaw) ? Math.round(openingRaw * 100) / 100 : 0;
  const base = {
    bankName: String(acc.bankName || acc.name || acc.bank || acc.banco || acc.label || '').trim(),
    branch: String(acc.branch || acc.agency || acc.agencia || '').trim(),
    account: String(acc.account || acc.conta || acc.accountNumber || '').trim(),
    accountName: String(acc.accountName || acc.holderName || '').trim(),
    pixKey: String(acc.pixKey || acc.pix || acc.chavePix || '').trim(),
    openingBalance: openingBalance >= 0 ? openingBalance : 0,
    openingBalanceDate: parseOpeningBalanceDate(acc.openingBalanceDate),
  };
  if (usesDefaultAcquirerFees(acc)) {
    return { ...base, useDefaultAcquirerFees: true };
  }
  return {
    ...base,
    useDefaultAcquirerFees: false,
    acquirerFees: normalizeAcquirerFees(acc.acquirerFees || defaultAcquirerFees()),
  };
}

/** Conta utilizável em pagamentos (banco, PIX ou número de conta). */
export function isUsableBankAccount(acc) {
  const n = normalizeBankAccountEntry(acc);
  return Boolean(n.bankName || n.pixKey || n.account);
}

/** Mantém só contas utilizáveis (evita linha vazia na lista). */
export function filterBankAccountsWithBank(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return list.map((acc) => normalizeBankAccountEntry(acc)).filter(isUsableBankAccount);
}

export function formatBankAccountLabel(acc) {
  const bank = String(acc?.bankName || '').trim();
  const acct = String(acc?.account || '').trim();
  const pix = String(acc?.pixKey || '').trim();
  if (bank && acct) return `${bank} · ${acct}`;
  if (bank) return bank;
  if (acct) return acct;
  if (pix) return pix.length > 28 ? `PIX ${pix.slice(0, 14)}…` : `PIX ${pix}`;
  return '';
}

export function listBankAccountLabels(financeConfig) {
  return filterBankAccountsWithBank(financeConfig?.bankAccounts).map((acc) => formatBankAccountLabel(acc)).filter(Boolean);
}

/** Rótulo da conta marcada como padrão no financeConfig (se houver). */
export function resolveDefaultBankAccountLabel(financeConfig) {
  const fromRoot = String(
    financeConfig?.defaultAccount || financeConfig?.defaultBankAccount || ''
  ).trim();
  if (fromRoot) return fromRoot;
  const list = Array.isArray(financeConfig?.bankAccounts) ? financeConfig.bankAccounts : [];
  for (const raw of list) {
    const acc = raw && typeof raw === 'object' ? raw : {};
    if (acc.isDefault === true || acc.default === true || acc.defaultAccount === true) {
      const normalized = normalizeBankAccountEntry(acc);
      if (normalized.bankName) return formatBankAccountLabel(normalized);
    }
  }
  return '';
}

export function hasConfiguredBankAccounts(financeConfig) {
  return listBankAccountLabels(financeConfig).length > 0;
}

/** Conta efetiva do lançamento: valor válido, ou primeira cadastrada se vazio/legado. */
export function resolveBankAccountForPayment(account, financeConfig) {
  const labels = listBankAccountLabels(financeConfig);
  if (!labels.length) return String(account || '').trim();
  const v = String(account || '').trim();
  if (v && labels.includes(v)) return v;
  return labels[0] || '';
}

/** Valor salvo no lead/pagamento bate com alguma conta cadastrada (ou legado vazio). */
export function bankAccountValueMatchesOptions(value, financeConfig) {
  const v = String(value || '').trim();
  if (!v) return true;
  const labels = listBankAccountLabels(financeConfig);
  if (!labels.length) return true;
  return labels.some((lbl) => lbl === v);
}

/** Conta habitual no perfil do aluno — vazio é permitido. */
export function validatePreferredPaymentAccount(account, financeConfig) {
  const v = String(account || '').trim();
  if (!v) return { ok: true };
  if (!bankAccountValueMatchesOptions(v, financeConfig)) {
    return {
      ok: false,
      message: 'Conta habitual: selecione uma conta cadastrada na academia ou deixe em branco.',
    };
  }
  return { ok: true };
}

export function validateBankAccountForPayment(account, financeConfig) {
  const labels = listBankAccountLabels(financeConfig);
  if (!labels.length) {
    return { ok: false, message: 'Cadastre pelo menos uma conta bancária antes do lançamento.' };
  }
  const v = resolveBankAccountForPayment(account, financeConfig);
  if (!v) {
    return { ok: false, message: 'Selecione a conta bancária do lançamento.' };
  }
  if (!labels.includes(v)) {
    return { ok: false, message: 'Selecione uma conta cadastrada na academia.' };
  }
  return { ok: true, account: v };
}
