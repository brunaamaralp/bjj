/** Contas bancárias da academia (financeConfig.bankAccounts). */

/** Mantém só contas com nome de banco preenchido (evita linha vazia na lista). */
export function filterBankAccountsWithBank(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return list.filter((acc) => String(acc?.bankName || '').trim());
}

export function formatBankAccountLabel(acc) {
  const bank = String(acc?.bankName || '').trim();
  const acct = String(acc?.account || '').trim();
  if (bank && acct) return `${bank} · ${acct}`;
  return bank || acct || '';
}

export function listBankAccountLabels(financeConfig) {
  const list = Array.isArray(financeConfig?.bankAccounts) ? financeConfig.bankAccounts : [];
  return list.map((acc) => formatBankAccountLabel(acc)).filter(Boolean);
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
  const v = String(account || '').trim();
  if (!v) {
    return { ok: false, message: 'Selecione a conta bancária do lançamento.' };
  }
  if (!labels.includes(v)) {
    return { ok: false, message: 'Selecione uma conta cadastrada na academia.' };
  }
  return { ok: true };
}
